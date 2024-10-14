import { ActorRefFrom, assign, createMachine, EventObject } from 'xstate';
import { agentMachine } from './agentMachine';

export function checkWin(board: Array<Player | null>): string {
  const winningLines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];

  for (let line of winningLines) {
    const xWon = line.every((index) => board[index] === 'x');
    if (xWon) {
      return 'x';
    }

    const oWon = line.every((index) => board[index] === 'o');
    if (oWon) {
      return 'o';
    }
  }

  return '';
}

export type Player = 'x' | 'o';

const context = {
  board: Array(9).fill(null) as Array<Player | null>,
  moves: 0,
  player: 'x' as Player,
  winner: undefined as Player | undefined,
  players: {
    x: 'agent' as 'human' | 'agent',
    o: 'agent' as 'human' | 'agent'
  },
  agents: {} as {
    [key in Player]?: ActorRefFrom<typeof agentMachine>;
  }
};

export const ticTacToeMachine = createMachine(
  {
    id: 'ticTacToeMachine',
    initial: 'init',
    context,
    states: {
      init: {
        entry: 'spawnAgents',
        always: 'playing'
      },
      playing: {
        initial: 'decideTurn',
        states: {
          decideTurn: {
            always: [
              { guard: 'isAgentTurn', target: 'agentTurn' },
              { guard: 'isHumanTurn', target: 'humanTurn' }
            ]
          },
          humanTurn: {
            on: {
              PLAY: {
                guard: 'isValidMove',
                actions: 'updateBoard',
                target: 'checking'
              }
            }
          },
          agentTurn: {
            entry: 'notifyAgent',
            on: {
              PLAY: {
                guard: 'isValidMove',
                actions: 'updateBoard',
                target: 'checking'
              }
            }
          },
          checking: {
            always: [
              {
                guard: 'checkWin',
                target: '#ticTacToeMachine.gameOver.winner'
              },
              { guard: 'checkDraw', target: '#ticTacToeMachine.gameOver.draw' },
              { target: 'decideTurn' }
            ]
          }
        }
      },
      gameOver: {
        initial: 'winner',
        states: {
          winner: {
            entry: 'setWinner',
            tags: 'winner'
          },
          draw: {
            tags: 'draw'
          }
        },
        on: {
          RESET: {
            target: 'playing',
            actions: 'resetGame'
          }
        }
      }
    }
  },
  {
    actions: {
      spawnAgents: assign({
        agents: ({ spawn, context }) => {
          const agents = { ...context.agents };

          for (const player of ['x', 'o'] as Player[]) {
            if (context.players[player] === 'agent') {
              agents[player] = spawn(agentMachine, {
                id: `agent-${player}`,
                input: { player }
              });
            }
          }

          return agents;
        }
      }),
      notifyAgent: ({ context }) => {
        const agent = context.agents[context.player];
        if (agent) {
          agent.send({ type: 'YOUR_TURN', board: context.board });
        }
      },
      updateBoard: assign({
        board: ({ context, event }) => {
          const playEvent = event as { type: 'PLAY'; value: number };
          const updatedBoard = [...context.board];
          updatedBoard[playEvent.value] = context.player;
          return updatedBoard;
        },
        moves: ({ context }) => context.moves + 1,
        player: ({ context }) => (context.player === 'x' ? 'o' : 'x')
      }),
      resetGame: assign(({ context }) => ({
        board: Array(9).fill(null),
        moves: 0,
        player: 'x' as Player,
        winner: undefined,
        players: context.players,
        agents: context.agents
      })),
      setWinner: assign({
        winner: ({ context }) => (context.player === 'x' ? 'o' : 'x')
      })
    },
    guards: {
      isAgentTurn: ({ context }) => context.players[context.player] === 'agent',
      isHumanTurn: ({ context }) => context.players[context.player] === 'human',
      checkWin: ({ context }) => {
        const { board } = context;
        return checkWin(board) !== '';
      },
      checkDraw: ({ context }) => {
        return context.moves === 9 && !context.winner;
      },
      isValidMove: ({ context, event }) => {
        if (event.type !== 'PLAY') return false;
        return context.board[event.value] === null;
      }
    }
  }
);
