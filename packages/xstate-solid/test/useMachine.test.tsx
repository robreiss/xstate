/* @jsxImportSource solid-js */
import { useMachine, useActor } from '../src';
import {
  assign,
  Interpreter,
  spawn,
  doneInvoke,
  State,
  createMachine,
  send as xsend,
  InterpreterFrom,
  AnyState
} from 'xstate';
import { render, screen, waitFor, fireEvent } from 'solid-testing-library';
import { DoneEventObject } from 'xstate';
import {
  createEffect,
  createSignal,
  Match,
  mergeProps,
  on,
  onMount,
  Switch
} from 'solid-js';

afterEach(() => {
  jest.useRealTimers();
});

describe('useMachine hook', () => {
  const context = {
    data: undefined
  };
  const fetchMachine = createMachine<
    typeof context,
    { type: 'FETCH' } | DoneEventObject
  >({
    id: 'fetch',
    initial: 'idle',
    context,
    states: {
      idle: {
        on: { FETCH: 'loading' }
      },
      loading: {
        invoke: {
          id: 'fetchData',
          src: 'fetchData',
          onDone: {
            target: 'success',
            actions: assign({
              data: (_, e) => e.data
            }),
            cond: (_, e) => e.data.length
          }
        }
      },
      success: {
        type: 'final'
      }
    }
  });

  const persistedFetchState = fetchMachine.transition(
    'loading',
    doneInvoke('fetchData', 'persisted data')
  );

  const Fetcher = (props: {
    onFetch: () => Promise<any>;
    persistedState?: AnyState;
  }) => {
    const mergedProps = mergeProps(
      {
        onFetch: () => new Promise((res) => res('some data'))
      },
      props
    );
    const [current, send] = useMachine(fetchMachine, {
      services: {
        fetchData: mergedProps.onFetch
      },
      state: mergedProps.persistedState
    });

    return (
      <Switch fallback={null}>
        <Match when={current.matches('idle')}>
          <button onclick={(_) => send({ type: 'FETCH' })}>Fetch</button>;
        </Match>
        <Match when={current.matches('loading')}>
          <div>Loading...</div>
        </Match>
        <Match when={current.matches('success')}>
          Success! Data: <div data-testid="data">{current.context.data}</div>
        </Match>
      </Switch>
    );
  };

  it('should work with the useMachine hook', async () => {
    render(() => (
      <Fetcher onFetch={() => new Promise((res) => res('fake data'))} />
    ));
    const button = screen.getByText('Fetch');
    fireEvent.click(button);
    screen.getByText('Loading...');
    await waitFor(() => screen.getByText(/Success/));
    const dataEl = screen.getByTestId('data');
    expect(dataEl.textContent).toBe('fake data');
  });

  it('should work with the useMachine hook (rehydrated state)', async () => {
    render(() => (
      <Fetcher
        onFetch={() => new Promise((res) => res('fake data'))}
        persistedState={persistedFetchState}
      />
    ));

    await waitFor(() => screen.getByText(/Success/));
    const dataEl = screen.getByTestId('data');
    expect(dataEl.textContent).toBe('persisted data');
  });

  it('should work with the useMachine hook (rehydrated state config)', async () => {
    const persistedFetchStateConfig = JSON.parse(
      JSON.stringify(persistedFetchState)
    );
    render(() => (
      <Fetcher
        onFetch={() => new Promise((res) => res('fake data'))}
        persistedState={persistedFetchStateConfig}
      />
    ));

    await waitFor(() => screen.getByText(/Success/));
    const dataEl = screen.getByTestId('data');
    expect(dataEl.textContent).toBe('persisted data');
  });

  it('should provide the service', () => {
    const Test = () => {
      const [, , service] = useMachine(fetchMachine);

      if (!(service instanceof Interpreter)) {
        throw new Error('service not instance of Interpreter');
      }

      return null;
    };

    render(() => <Test />);
  });

  it('should provide options for the service', () => {
    const Test = () => {
      const [, , service] = useMachine(fetchMachine, {
        execute: false
      });

      expect(service.options.execute).toBe(false);

      return null;
    };

    render(() => <Test />);
  });

  it('should merge machine context with options.context', () => {
    const testMachine = createMachine<{ foo: string; test: boolean }>({
      context: {
        foo: 'bar',
        test: false
      },
      initial: 'idle',
      states: {
        idle: {}
      }
    });

    const Test = () => {
      const [state] = useMachine(testMachine, { context: { test: true } });

      expect(state.context).toEqual({
        foo: 'bar',
        test: true
      });

      return null;
    };

    render(() => <Test />);
  });

  it('should not spawn actors until service is started', (done) => {
    const spawnMachine = createMachine<any>({
      id: 'spawn',
      initial: 'start',
      context: { ref: undefined },
      states: {
        start: {
          entry: assign({
            ref: () => spawn(() => new Promise((res) => res(42)), 'my-promise')
          }),
          on: {
            [doneInvoke('my-promise')]: 'success'
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    const Spawner = () => {
      const [current] = useMachine(spawnMachine);

      return (
        <Switch fallback={null}>
          <Match when={current.value === 'start'}>
            <span data-testid="start" />
          </Match>
          <Match when={current.value === 'success'}>
            <span data-testid="success" />
          </Match>
        </Switch>
      );
    };

    render(() => <Spawner />);
    waitFor(() => screen.getByTestId('success')).then(() => done());
  });

  it('actions should not have stale data', (done) => {
    const toggleMachine = createMachine<any, { type: 'TOGGLE' }>({
      initial: 'inactive',
      states: {
        inactive: {
          on: { TOGGLE: 'active' }
        },
        active: {
          entry: 'doAction'
        }
      }
    });

    const Toggle = () => {
      const [ext, setExt] = createSignal(false);

      const doAction = () => {
        expect(ext()).toBeTruthy();
        done();
      };

      const [, send] = useMachine(toggleMachine, {
        actions: {
          doAction
        }
      });

      return (
        <div>
          <button
            data-testid="extbutton"
            onclick={(_) => {
              setExt(true);
            }}
          />
          <button
            data-testid="button"
            onclick={(_) => {
              send({ type: 'TOGGLE' });
            }}
          />
        </div>
      );
    };

    render(() => <Toggle />);

    const button = screen.getByTestId('button');
    const extButton = screen.getByTestId('extbutton');
    fireEvent.click(extButton);

    fireEvent.click(button);
  });

  it('should compile with typed matches (createMachine)', () => {
    interface TestContext {
      count?: number;
      user?: { name: string };
    }

    type TestState =
      | {
          value: 'loading';
          context: { count: number; user: undefined };
        }
      | {
          value: 'loaded';
          context: { user: { name: string } };
        };

    const machine = createMachine<TestContext, any, TestState>({
      initial: 'loading',
      states: {
        loading: {
          initial: 'one',
          states: {
            one: {},
            two: {}
          }
        },
        loaded: {}
      }
    });

    const ServiceApp = (props: {
      service: InterpreterFrom<typeof machine>;
    }) => {
      const [state] = useActor(() => props.service);

      if (state().matches('loaded')) {
        const name = state().context.user?.name;

        // never called - it's okay if the name is undefined
        expect(name).toBeTruthy();
      } else if (state().matches('loading')) {
        // Make sure state isn't "never" - if it is, tests will fail to compile
        expect(state).toBeTruthy();
      }

      return null;
    };

    const App = () => {
      const [state, , service] = useMachine(machine);

      if (state.matches('loaded')) {
        const name = state.context.user.name;

        // never called - it's okay if the name is undefined
        expect(name).toBeTruthy();
      } else if (state.matches('loading')) {
        // Make sure state isn't "never" - if it is, tests will fail to compile
        expect(state).toBeTruthy();
      }

      return <ServiceApp service={service} />;
    };

    // Just testing that it compiles
    render(() => <App />);
  });

  it('should capture all actions', (done) => {
    let count = 0;

    const machine = createMachine<any, { type: 'EVENT' }>({
      initial: 'active',
      states: {
        active: {
          on: {
            EVENT: {
              actions: () => {
                count++;
              }
            }
          }
        }
      }
    });

    const App = () => {
      const [stateCount, setStateCount] = createSignal(0);
      const [state, send] = useMachine(machine);
      createEffect(
        on(
          () => state.transitions[0],
          () => {
            setStateCount((c) => c + 1);
          }
        )
      );
      onMount(() => {
        send({ type: 'EVENT' });
        send({ type: 'EVENT' });
        send({ type: 'EVENT' });
        send({ type: 'EVENT' });
      });

      return <div data-testid="count">{stateCount()}</div>;
    };

    render(() => <App />);

    const countEl = screen.getByTestId('count');

    // Component should only rerender twice:
    // - 1 time for the initial state
    // - and 1 time for the four (batched) events
    expect(countEl.textContent).toEqual('2');
    expect(count).toEqual(4);
    done();
  });

  it('should capture only array updates', (done) => {
    const machine = createMachine<
      {
        item: {
          counts: Array<{ value: number }>;
          totals: Array<{ value: number }>;
        };
      },
      { type: 'COUNT' } | { type: 'TOTAL' }
    >({
      initial: 'active',
      context: {
        item: {
          counts: [{ value: 0 }],
          totals: [{ value: 0 }]
        }
      },
      states: {
        active: {
          on: {
            COUNT: {
              actions: [
                assign({
                  item: (ctx) => ({
                    ...ctx.item,
                    counts: [
                      ...ctx.item.counts,
                      { value: ctx.item.counts.length + 1 }
                    ]
                  })
                })
              ]
            },
            TOTAL: {
              actions: [
                assign({
                  item: (ctx) => ({
                    ...ctx.item,
                    totals: [
                      ...ctx.item.totals,
                      { value: ctx.item.totals.length + 1 }
                    ]
                  })
                })
              ]
            }
          }
        }
      }
    });

    const App = () => {
      const [stateCount, setStateCount] = createSignal(0);
      const [state, send] = useMachine(machine);
      createEffect(
        on(
          () => [...state.context.item.counts],
          () => {
            setStateCount((c) => c + 1);
          },
          { defer: true }
        )
      );
      onMount(() => {
        send({ type: 'COUNT' });
        send({ type: 'TOTAL' });
        send({ type: 'COUNT' });
        send({ type: 'TOTAL' });
      });

      return <div data-testid="count">{stateCount()}</div>;
    };

    render(() => <App />);

    const countEl = screen.getByTestId('count');

    // Effect should only trigger once for the COUNT events:
    expect(countEl.textContent).toEqual('1');
    done();
  });

  it('useMachine state should only trigger effect of directly tracked value', () => {
    const counterMachine2 = createMachine<{
      subCount: { subCount1: { subCount2: { count: number } } };
    }>({
      id: 'counter',
      initial: 'active',
      context: { subCount: { subCount1: { subCount2: { count: 0 } } } },
      states: {
        active: {
          on: {
            INC: {
              actions: assign({
                subCount: (ctx) => ({
                  ...ctx.subCount,
                  subCount1: {
                    ...ctx.subCount.subCount1,
                    subCount2: {
                      ...ctx.subCount.subCount1.subCount2,
                      count: ctx.subCount.subCount1.subCount2.count + 1
                    }
                  }
                })
              })
            },
            SOMETHING: { actions: 'doSomething' }
          }
        }
      }
    });

    const Counter = () => {
      const [state, send] = useMachine(counterMachine2);
      const [effectCount, setEffectCount] = createSignal(0);
      createEffect(
        on(
          () => state.context.subCount.subCount1,
          () => {
            setEffectCount((prev) => prev + 1);
          },
          {
            defer: true
          }
        )
      );
      return (
        <div>
          <button data-testid="inc" onclick={(_) => send({ type: 'INC' })} />
          <div data-testid="effect-count">{effectCount()}</div>
          <div data-testid="count">
            {state.context.subCount.subCount1.subCount2.count}
          </div>
        </div>
      );
    };

    render(() => <Counter />);

    const incButton = screen.getByTestId('inc');
    const countEl = screen.getByTestId('count');
    const effectCountEl = screen.getByTestId('effect-count');

    expect(countEl.textContent).toBe('0');
    fireEvent.click(incButton);
    expect(countEl.textContent).toBe('1');
    expect(effectCountEl.textContent).toBe('0');
    fireEvent.click(incButton);
    expect(countEl.textContent).toBe('2');
    expect(effectCountEl.textContent).toBe('0');
  });

  it('should capture only nested value update', (done) => {
    const machine = createMachine<
      { item: { count: number; total: number } },
      { type: 'COUNT' } | { type: 'TOTAL' }
    >({
      initial: 'active',
      context: {
        item: {
          count: 0,
          total: 0
        }
      },
      states: {
        active: {
          on: {
            COUNT: {
              actions: [
                assign({
                  item: (ctx) => ({ ...ctx.item, count: ctx.item.count + 1 })
                })
              ]
            },
            TOTAL: {
              actions: [
                assign({
                  item: (ctx) => ({ ...ctx.item, total: ctx.item.total + 1 })
                })
              ]
            }
          }
        }
      }
    });

    const App = () => {
      const [stateCount, setStateCount] = createSignal(0);
      const [state, send] = useMachine(machine);
      createEffect(
        on(
          () => state.context.item.count,
          () => {
            setStateCount((c) => c + 1);
          },
          { defer: true }
        )
      );
      onMount(() => {
        send({ type: 'COUNT' });
        send({ type: 'TOTAL' });
        send({ type: 'COUNT' });
        send({ type: 'TOTAL' });
      });

      return <div data-testid="count">{stateCount()}</div>;
    };

    render(() => <App />);

    const countEl = screen.getByTestId('count');

    // Effect should only trigger once for the COUNT events:
    expect(countEl.textContent).toEqual('1');
    done();
  });

  it('should capture initial actions', (done) => {
    let count = 0;

    const machine = createMachine({
      initial: 'active',
      states: {
        active: {
          entry: () => {
            count++;
          }
        }
      }
    });

    const App = () => {
      useMachine(machine);

      return <div />;
    };

    render(() => <App />);

    expect(count).toEqual(1);
    done();
  });

  it('should be reactive to toStrings method calls', (done) => {
    const machine = createMachine({
      initial: 'green',
      states: {
        green: {
          on: {
            TRANSITION: 'yellow'
          }
        },
        yellow: {
          on: {
            TRANSITION: 'red'
          }
        },
        red: {
          on: {
            TRANSITION: 'green'
          }
        }
      }
    });

    const App = () => {
      const [state, send] = useMachine(machine);
      const [toStrings, setToStrings] = createSignal(state.toStrings());
      createEffect(
        on(
          () => state.value,
          () => {
            setToStrings(state.toStrings());
          }
        )
      );
      return (
        <div>
          <button
            data-testid="transition-button"
            onclick={() => send({ type: 'TRANSITION' })}
          />
          <div data-testid="to-strings">{JSON.stringify(toStrings())}</div>
        </div>
      );
    };

    render(() => <App />);
    const toStringsEl = screen.getByTestId('to-strings');
    const transitionBtn = screen.getByTestId('transition-button');

    // Green
    expect(toStringsEl.textContent).toEqual('["green"]');
    transitionBtn.click();

    // Yellow
    expect(toStringsEl.textContent).toEqual('["yellow"]');
    transitionBtn.click();

    // Red
    expect(toStringsEl.textContent).toEqual('["red"]');
    transitionBtn.click();

    // Green
    expect(toStringsEl.textContent).toEqual('["green"]');

    done();
  });

  it('should be reactive to toJSON method calls', (done) => {
    const machine = createMachine({
      initial: 'green',
      states: {
        green: {
          on: {
            TRANSITION: 'yellow'
          }
        },
        yellow: {
          on: {
            TRANSITION: 'red'
          }
        },
        red: {
          on: {
            TRANSITION: 'green'
          }
        }
      }
    });

    const App = () => {
      const [state, send] = useMachine(machine);
      const [toJson, setToJson] = createSignal(state.toJSON());
      createEffect(
        on(
          () => state.value,
          () => {
            setToJson(state.toJSON());
          }
        )
      );
      return (
        <div>
          <button
            data-testid="transition-button"
            onclick={() => send({ type: 'TRANSITION' })}
          />
          <div data-testid="to-json">{toJson().value.toString()}</div>
        </div>
      );
    };

    render(() => <App />);
    const toJsonEl = screen.getByTestId('to-json');
    const transitionBtn = screen.getByTestId('transition-button');

    // Green
    expect(toJsonEl.textContent).toEqual('green');
    transitionBtn.click();

    // Yellow
    expect(toJsonEl.textContent).toEqual('yellow');
    transitionBtn.click();

    // Red
    expect(toJsonEl.textContent).toEqual('red');
    transitionBtn.click();

    // Green
    expect(toJsonEl.textContent).toEqual('green');

    done();
  });

  it('should be reactive to hasTag method calls', (done) => {
    const machine = createMachine({
      initial: 'green',
      states: {
        green: {
          tags: 'go',
          on: {
            TRANSITION: 'yellow'
          }
        },
        yellow: {
          tags: 'go',
          on: {
            TRANSITION: 'red'
          }
        },
        red: {
          tags: ['stop', 'other'],
          on: {
            TRANSITION: 'green'
          }
        }
      }
    });

    const App = () => {
      const [state, send] = useMachine(machine);
      const [canGo, setCanGo] = createSignal(state.hasTag('go'));
      createEffect(() => {
        setCanGo(state.hasTag('go'));
      });
      return (
        <div>
          <button
            data-testid="transition-button"
            onclick={() => send({ type: 'TRANSITION' })}
          />
          <div data-testid="can-go">{canGo().toString()}</div>
          <div data-testid="stop">{state.hasTag('stop').toString()}</div>
        </div>
      );
    };

    render(() => <App />);
    const canGoEl = screen.getByTestId('can-go');
    const stopEl = screen.getByTestId('stop');
    const transitionBtn = screen.getByTestId('transition-button');

    // Green
    expect(canGoEl.textContent).toEqual('true');
    expect(stopEl.textContent).toEqual('false');
    transitionBtn.click();

    // Yellow
    expect(canGoEl.textContent).toEqual('true');
    expect(stopEl.textContent).toEqual('false');
    transitionBtn.click();

    // Red
    expect(canGoEl.textContent).toEqual('false');
    expect(stopEl.textContent).toEqual('true');
    transitionBtn.click();

    // Green
    expect(canGoEl.textContent).toEqual('true');
    expect(stopEl.textContent).toEqual('false');
    done();
  });

  it('should be reactive to can method calls', (done) => {
    const machine = createMachine({
      initial: 'inactive',
      states: {
        inactive: {
          on: {
            TOGGLE: 'active'
          }
        },
        active: {
          on: {
            DO_SOMETHING: { actions: ['something'] }
          }
        }
      }
    });

    const App = () => {
      const [state, send] = useMachine(machine);
      const [canToggle, setCanToggle] = createSignal(state.can('TOGGLE'));
      createEffect(() => {
        setCanToggle(state.can('TOGGLE'));
      });
      return (
        <div>
          <button
            data-testid="toggle-button"
            onclick={() => send({ type: 'TOGGLE' })}
          />
          <div data-testid="can-toggle">{canToggle().toString()}</div>
          <div data-testid="can-do-something">
            {state.can('DO_SOMETHING').toString()}
          </div>
        </div>
      );
    };

    render(() => <App />);
    const canToggleEl = screen.getByTestId('can-toggle');
    const canDoSomethingEl = screen.getByTestId('can-do-something');
    const toggleBtn = screen.getByTestId('toggle-button');

    expect(canToggleEl.textContent).toEqual('true');
    expect(canDoSomethingEl.textContent).toEqual('false');
    toggleBtn.click();
    expect(canToggleEl.textContent).toEqual('false');
    expect(canDoSomethingEl.textContent).toEqual('true');
    done();
  });

  it('should successfully spawn actors from the lazily declared context', () => {
    let childSpawned = false;

    const machine = createMachine({
      context: () => ({
        ref: spawn(() => {
          childSpawned = true;
        })
      })
    });

    const App = () => {
      useMachine(machine);
      return null;
    };

    render(() => <App />);

    expect(childSpawned).toBe(true);
  });

  it('should be able to use an action provided outside of SolidJS', () => {
    let actionCalled = false;

    const machine = createMachine(
      {
        on: {
          EV: {
            actions: 'foo'
          }
        }
      },
      {
        actions: {
          foo: () => (actionCalled = true)
        }
      }
    );

    const App = () => {
      const [, send] = useMachine(machine);
      send({ type: 'EV' });
      return null;
    };

    render(() => <App />);

    expect(actionCalled).toBe(true);
  });

  it('should be able to use a guard provided outside of SolidJS', () => {
    let guardCalled = false;

    const machine = createMachine(
      {
        initial: 'a',
        states: {
          a: {
            on: {
              EV: {
                cond: 'isAwesome',
                target: 'b'
              }
            }
          },
          b: {}
        }
      },
      {
        guards: {
          isAwesome: () => {
            guardCalled = true;
            return true;
          }
        }
      }
    );

    const App = () => {
      const [_state, send] = useMachine(machine);
      send({ type: 'EV' });
      return null;
    };

    render(() => <App />);

    expect(guardCalled).toBe(true);
  });

  it('should be able to use a service provided outside of SolidJS', () => {
    let serviceCalled = false;

    const machine = createMachine(
      {
        initial: 'a',
        states: {
          a: {
            on: {
              EV: 'b'
            }
          },
          b: {
            invoke: {
              src: 'foo'
            }
          }
        }
      },
      {
        services: {
          foo: () => {
            serviceCalled = true;
            return Promise.resolve();
          }
        }
      }
    );

    const App = () => {
      const [, send] = useMachine(machine);
      send({ type: 'EV' });
      return null;
    };

    render(() => <App />);

    expect(serviceCalled).toBe(true);
  });

  it('should be able to use a delay provided outside of SolidJS', () => {
    jest.useFakeTimers();

    const machine = createMachine(
      {
        initial: 'a',
        states: {
          a: {
            on: {
              EV: 'b'
            }
          },
          b: {
            after: {
              myDelay: 'c'
            }
          },
          c: {}
        }
      },
      {
        delays: {
          myDelay: () => {
            return 300;
          }
        }
      }
    );

    const App = () => {
      const [state, send] = useMachine(machine);
      return (
        <div>
          <div data-testid="result">
            {typeof state.value === 'string'
              ? state.value
              : state.value.toString()}
          </div>
          <button role="button" onclick={() => send({ type: 'EV' })} />
        </div>
      );
    };

    render(() => <App />);

    const btn = screen.getByRole('button');
    fireEvent.click(btn);

    expect(screen.getByTestId('result').textContent).toBe('b');

    jest.advanceTimersByTime(310);

    expect(screen.getByTestId('result').textContent).toBe('c');
  });

  it('should not use stale data in a guard', () => {
    const machine = createMachine({
      initial: 'a',
      states: {
        a: {
          on: {
            EV: {
              cond: 'isAwesome',
              target: 'b'
            }
          }
        },
        b: {}
      }
    });

    const App = (props: { isAwesome: boolean }) => {
      const [state, send] = useMachine(machine, {
        guards: {
          isAwesome: () => props.isAwesome
        }
      });
      return (
        <div>
          <div data-testid="result">{state.value.toString()}</div>
          <button
            data-testid="ev-button"
            onclick={() => send({ type: 'EV' })}
          />
        </div>
      );
    };

    const Container = () => {
      const [isAwesome, setIsAwesome] = createSignal(false);
      onMount(() => setIsAwesome(true));
      return <App isAwesome={isAwesome()} />;
    };

    render(() => <Container />);

    const btn = screen.getByTestId('ev-button');
    fireEvent.click(btn);

    expect(screen.getByTestId('result').textContent).toBe('b');
  });

  it('should not miss initial synchronous updates', () => {
    const m = createMachine<{ count: number }>({
      initial: 'idle',
      context: {
        count: 0
      },
      entry: [assign({ count: 1 }), xsend({ type: 'INC' })],
      on: {
        INC: {
          actions: [
            assign({ count: (ctx) => ++ctx.count }),
            xsend({ type: 'UNHANDLED' })
          ]
        }
      },
      states: {
        idle: {}
      }
    });

    const App = () => {
      const [state] = useMachine(m);
      return <div data-testid="sync-count">{state.context.count}</div>;
    };

    render(() => <App />);
    const countEl = screen.getByTestId('sync-count');
    expect(countEl.textContent).toBe('2');
  });
  it('should not use stale data in a guard', () => {
    const machine = createMachine({
      initial: 'a',
      states: {
        a: {
          on: {
            EV: {
              cond: 'isAwesome',
              target: 'b'
            }
          }
        },
        b: {}
      }
    });
    const [isAwesome, setIsAwesome] = createSignal(false);
    const App = () => {
      const [state, send] = useMachine(machine, {
        guards: {
          isAwesome: () => isAwesome()
        }
      });
      return (
        <div>
          <div data-testid="result">{state.value.toString()}</div>
          <button onclick={() => send({ type: 'EV' })} />
        </div>
      );
    };

    render(() => <App />);
    setIsAwesome(true);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);

    expect(screen.getByTestId('result').textContent).toBe('b');
  });

  it('referenced object in context should not update both machines', (done) => {
    const latestValue = { value: 100 };
    interface Context {
      latestValue: { value: number };
    }
    const machine = createMachine<Context, { type: 'INC' }>({
      initial: 'initial',
      context: {
        latestValue
      },
      states: {
        initial: {
          on: {
            INC: {
              actions: [
                assign({
                  latestValue: (ctx: Context) => ({
                    value: ctx.latestValue.value + 1
                  })
                })
              ]
            }
          }
        }
      }
    });

    const Test = () => {
      const [state1, send1] = useMachine(machine);
      const [state2, send2] = useMachine(machine);

      return (
        <div>
          <div>
            <button data-testid="inc-machine1" onclick={() => send1('INC')}>
              INC 1
            </button>
            <div data-testid="value-machine1">
              {state1.context.latestValue.value}
            </div>
          </div>
          <div>
            <button data-testid="inc-machine2" onclick={() => send2('INC')}>
              INC 1
            </button>
            <div data-testid="value-machine2">
              {state2.context.latestValue.value}
            </div>
          </div>
        </div>
      );
    };

    render(() => <Test />);

    const machine1Value = screen.getByTestId('value-machine1');
    const machine2Value = screen.getByTestId('value-machine2');
    const incMachine1 = screen.getByTestId('inc-machine1');
    const incMachine2 = screen.getByTestId('inc-machine2');

    expect(machine1Value.textContent).toEqual('100');
    expect(machine2Value.textContent).toEqual('100');

    fireEvent.click(incMachine1);

    expect(machine1Value.textContent).toEqual('101');
    expect(machine2Value.textContent).toEqual('100');

    fireEvent.click(incMachine2);

    expect(machine1Value.textContent).toEqual('101');
    expect(machine2Value.textContent).toEqual('101');
    done();
  });
});

describe('useMachine (strict mode)', () => {
  it('should not invoke initial services more than once', () => {
    let activatedCount = 0;
    const machine = createMachine({
      initial: 'active',
      invoke: {
        src: () => {
          activatedCount++;
          return () => {
            // noop
          };
        }
      },
      states: {
        active: {}
      }
    });

    const Test = () => {
      useMachine(machine);

      return null;
    };

    render(() => <Test />);

    expect(activatedCount).toEqual(1);
  });

  it('child component should be able to send an event to a parent immediately in an effect', (done) => {
    const machine = createMachine<any, { type: 'FINISH' }>({
      initial: 'active',
      states: {
        active: {
          on: { FINISH: 'success' }
        },
        success: {}
      }
    });

    const ChildTest = (props: { send: any }) => {
      // This will send an event to the parent service
      // BEFORE the service is ready.
      onMount(() => {
        props.send({ type: 'FINISH' });
      });

      return null;
    };

    const Test = () => {
      const [state, send] = useMachine(machine);
      createEffect(() => {
        if (state.matches('success')) {
          done();
        }
      });
      return <ChildTest send={send} />;
    };

    render(() => <Test />);
  });

  it('custom data should be available right away for the invoked actor', (done) => {
    const childMachine = createMachine({
      initial: 'intitial',
      context: {
        value: 100
      },
      states: {
        intitial: {}
      }
    });

    const machine = createMachine({
      initial: 'active',
      states: {
        active: {
          invoke: {
            id: 'test',
            src: childMachine,
            data: {
              value: () => 42
            }
          }
        }
      }
    });

    const Test = () => {
      const [state] = useMachine(machine);
      const [childState] = useActor(() => state.children.test);

      expect(childState().context.value).toBe(42);

      return null;
    };

    render(() => <Test />);
    done();
  });

  // https://github.com/davidkpiano/xstate/issues/1334
  it('delayed transitions should work when initializing from a rehydrated state', () => {
    jest.useFakeTimers();
    try {
      const testMachine = createMachine<any, { type: 'START' }>({
        id: 'app',
        initial: 'idle',
        states: {
          idle: {
            on: {
              START: 'doingStuff'
            }
          },
          doingStuff: {
            id: 'doingStuff',
            after: {
              100: 'idle'
            }
          }
        }
      });

      const persistedState = JSON.stringify(testMachine.initialState);

      let currentState;

      const Test = () => {
        const [state, send] = useMachine(testMachine, {
          state: State.create(JSON.parse(persistedState))
        });
        createEffect(
          on(
            () => state.event,
            () => {
              currentState = state;
            }
          )
        );

        return (
          <button
            onclick={() => send({ type: 'START' })}
            data-testid="button"
          />
        );
      };

      render(() => <Test />);

      const button = screen.getByTestId('button');

      fireEvent.click(button);
      jest.advanceTimersByTime(110);

      expect(currentState.matches('idle')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
