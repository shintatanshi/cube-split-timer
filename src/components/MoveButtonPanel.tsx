const DEFAULT_MOVE_GROUPS = [
  ["U", "U'", "U2"],
  ["R", "R'", "R2"],
  ["L", "L'", "L2"],
  ["F", "F'", "F2"],
  ["B", "B'", "B2"],
  ["D", "D'", "D2"],
];

const ROTATION_GROUPS = [
  ["x", "x'", "x2"],
  ["y", "y'", "y2"],
  ["z", "z'", "z2"],
];

interface MoveButtonPanelProps {
  onMove: (move: string) => void;
  onUndo?: () => void;
  onResetManual?: () => void;
  onResetState?: () => void;
  canUndo?: boolean;
  manualMoveCount?: number;
  showRotations?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function MoveButtonPanel({
  onMove,
  onUndo,
  onResetManual,
  onResetState,
  canUndo = false,
  manualMoveCount = 0,
  showRotations = true,
  disabled = false,
  className = "",
}: MoveButtonPanelProps) {
  const groups = showRotations ? [...DEFAULT_MOVE_GROUPS, ...ROTATION_GROUPS] : DEFAULT_MOVE_GROUPS;

  return (
    <section className={["move-button-panel", className].filter(Boolean).join(" ")}>
      <div className="move-button-panel-head">
        <div>
          <p className="eyebrow">Manual moves</p>
          <h3>回転記号ボタン</h3>
        </div>
        <span>{manualMoveCount} moves</span>
      </div>

      <div className="move-button-groups" aria-label="Manual cube move buttons">
        {groups.map((group) => (
          <div className="move-button-group" key={group[0]}>
            {group.map((move) => (
              <button type="button" key={move} onClick={() => onMove(move)} disabled={disabled}>
                {move}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="move-history-actions">
        {onUndo && (
          <button type="button" onClick={onUndo} disabled={disabled || !canUndo}>
            一手戻る
          </button>
        )}
        {onResetManual && (
          <button type="button" onClick={onResetManual} disabled={disabled || manualMoveCount === 0}>
            手動操作リセット
          </button>
        )}
        {onResetState && (
          <button type="button" onClick={onResetState} disabled={disabled}>
            初期状態に戻す
          </button>
        )}
      </div>
    </section>
  );
}
