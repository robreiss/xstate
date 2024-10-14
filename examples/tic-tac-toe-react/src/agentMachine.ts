import { ActorSystem, assign, createMachine, sendTo } from 'xstate';
import { Player, checkWin } from './ticTacToeMachine';

function emptyIndexies(board: Array<Player | null>): number[] {
  return board.reduce((indices, s, i) => {
    if (s === null) {
      indices.push(i);
    }
    return indices;
  }, [] as number[]);
}

function minimax(
  board: Array<Player | null>,
  player: Player,
  depth: number = 0,
  alpha: number = -Infinity,
  beta: number = Infinity
): { index: number; score: number } {
  const availSpots = emptyIndexies(board);
  const winner = checkWin(board);

  // Base cases
  // Corrected base cases
  if (winner === 'o') return { index: -1, score: 10 - depth }; // Positive score when AI wins
  if (winner === 'x') return { index: -1, score: depth - 10 }; // Negative score when opponent wins

  // if (winner === 'x') return { index: -1, score: 10 - depth };
  // if (winner === 'o') return { index: -1, score: depth - 10 };
  if (availSpots.length === 0) return { index: -1, score: 0 };

  let bestMove: { index: number; score: number } = {
    index: -1,
    score: player === 'o' ? -Infinity : Infinity
  };

  // Evaluate possible moves
  for (const spot of availSpots) {
    board[spot] = player;
    const result = minimax(
      board,
      player === 'o' ? 'x' : 'o',
      depth + 1,
      alpha,
      beta
    );
    board[spot] = null; // Undo the move

    if (player === 'o') {
      if (result.score > bestMove.score) {
        bestMove = { index: spot, score: result.score };
      }
      alpha = Math.max(alpha, result.score);
    } else {
      if (result.score < bestMove.score) {
        bestMove = { index: spot, score: result.score };
      }
      beta = Math.min(beta, result.score);
    }

    // Alpha-beta pruning
    if (beta <= alpha) {
      break;
    }
  }

  return bestMove;
}

function chooseBestMove(board: Array<Player | null>): number {
  const bestMove = minimax(board, 'o');
  return bestMove.index;
}

export const agentMachine = createMachine(
  {
    id: 'agent',
    initial: 'idle',
    context: {
      player: 'o' as Player,
      chosenMove: undefined as number | undefined
    },
    states: {
      idle: {
        on: {
          YOUR_TURN: {
            target: 'thinking',
            actions: 'chooseMove'
          }
        }
      },
      thinking: {
        always: {
          target: 'idle',
          actions: 'sendMoveToParent'
        }
      }
    }
  },
  {
    actions: {
      chooseMove: assign(({ context, event }) => {
        const board = event.board as Array<Player | null>;
        const move = chooseBestMove(board);
        return {
          chosenMove: move
        };
      }),
      sendMoveToParent: sendTo(
        ({ system }: { system: ActorSystem<any> }) => system.get('root'),
        ({ context }) => {
          return {
            type: 'PLAY',
            value: context.chosenMove
          } as { type: 'PLAY'; value: number };
        }
      )
    }
  }
);
