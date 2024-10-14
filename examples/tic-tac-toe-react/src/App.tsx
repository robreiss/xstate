import { useMachine } from '@xstate/react';
import React from 'react';
import './styles.css';
import { ticTacToeMachine } from './ticTacToeMachine';

function range(start: number, end: number) {
  return Array(end - start)
    .fill(null)
    .map((_, i) => i + start);
}

const Tile: React.FC<{
  index: number;
  onClick: () => void;
  player: 'x' | 'o' | null;
}> = ({ index, onClick, player }) => {
  return (
    <div className="tile" key={index} onClick={onClick}>
      {player?.toUpperCase() ?? null}
    </div>
  );
};

export default function App() {
  const [state, send] = useMachine(ticTacToeMachine, { systemId: 'root' });

  // Add an effect to log the state after each transition
  // React.useEffect(() => {
  //   console.log('Current state:', state.value);
  //   console.log('Context:', state.context);
  // }, [state.value, state.context]);

  return (
    <div className="game">
      <h1>Tic-Tac-Toe</h1>
      {state.matches('gameOver') && (
        <div>
          {state.matches('gameOver.winner') && (
            <h2>Winner: {state.context.winner}</h2>
          )}
          {state.matches('gameOver.draw') && <h2>Draw</h2>}
          <button onClick={() => send({ type: 'RESET' })}>Reset</button>
        </div>
      )}
      <div className="board">
        {range(0, 9).map((index) => {
          return (
            <Tile
              index={index}
              onClick={() => send({ type: 'PLAY', value: index })}
              key={index}
              player={state.context.board[index]}
            />
          );
        })}
      </div>
    </div>
  );
}
