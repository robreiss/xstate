import {
  MachineConfig,
  EventObject,
  MachineContext,
  InternalMachineImplementations,
  ParameterizedObject,
  ProvidedActor,
  AnyEventObject
} from './types.ts';
import {
  TypegenConstraint,
  TypegenDisabled,
  ResolveTypegenMeta
} from './typegenTypes.ts';
import { StateMachine } from './StateMachine.ts';

export function createMachine<
  TContext extends MachineContext,
  TEvent extends EventObject = AnyEventObject,
  TActor extends ProvidedActor = ProvidedActor,
  TInput = any,
  TOutput = any,
  TActions extends ParameterizedObject = ParameterizedObject,
  TGuards extends ParameterizedObject = ParameterizedObject,
  TTypesMeta extends TypegenConstraint = TypegenDisabled
>(
  config: MachineConfig<
    TContext,
    TEvent,
    TActions,
    TActor,
    TInput,
    TOutput,
    TGuards,
    TTypesMeta
  >,
  implementations?: InternalMachineImplementations<
    TContext,
    TEvent,
    TActions,
    TActor,
    TGuards,
    ResolveTypegenMeta<TTypesMeta, TEvent, TActions, TActor>
  >
): StateMachine<
  TContext,
  TEvent,
  TActions,
  TActor,
  TInput,
  TOutput,
  TGuards,
  ResolveTypegenMeta<TTypesMeta, TEvent, TActions, TActor>
> {
  return new StateMachine<any, any, any, any, any, any, any, any>(
    config as any,
    implementations as any
  );
}
