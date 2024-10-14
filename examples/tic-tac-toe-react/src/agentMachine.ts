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
  depth: number = 0
): { index: number; score: number } {
  const availSpots = emptyIndexies(board);
  const winner = checkWin(board);

  if (winner === 'o') return { index: -1, score: 10 - depth };
  if (winner === 'x') return { index: -1, score: depth - 10 };

  if (availSpots.length === 0) return { index: -1, score: 0 };

  let bestScore = player === 'o' ? -Infinity : Infinity;
  let bestMoves: Array<{ index: number; score: number }> = [];

  // Evaluate possible moves
  for (const spot of availSpots) {
    board[spot] = player;
    const result = minimax(board, player === 'o' ? 'x' : 'o', depth + 1);
    board[spot] = null; // Undo the move

    if (player === 'o') {
      if (result.score > bestScore) {
        bestScore = result.score;
        bestMoves = [{ index: spot, score: result.score }];
      } else if (result.score === bestScore) {
        bestMoves.push({ index: spot, score: result.score });
      }
    } else {
      if (result.score < bestScore) {
        bestScore = result.score;
        bestMoves = [{ index: spot, score: result.score }];
      } else if (result.score === bestScore) {
        bestMoves.push({ index: spot, score: result.score });
      }
    }
  }

  // Randomly select one of the best moves
  const randomMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
  return randomMove;
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
