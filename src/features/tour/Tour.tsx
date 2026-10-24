import { useState, type ReactNode } from "react";
import {
  BottomSheet,
  Button,
  CalendarIcon,
  GaugeIcon,
  MapPinIcon,
} from "../../components";

/**
 * The first-run tour (UI Polish Phase 6): three short cards in the
 * DS BottomSheet, shown once after first-launch setup (Today mounts
 * it; Settings → About can replay it). Steppable with Next / Done,
 * skippable with Skip, the sheet's backdrop or Escape — every exit
 * counts as finished. Step changes swap content in place: no slide
 * or transform animation of their own, so reduced-motion needs
 * nothing extra (the sheet's own entrance already fades there).
 */

interface TourStep {
  icon: ReactNode;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    icon: <GaugeIcon width={30} height={30} />,
    title: "Start your day with the odometer",
    body: "Each morning, tap Start Day and type the odometer reading at Home. That's all a day needs to begin.",
  },
  {
    icon: <MapPinIcon width={30} height={30} />,
    title: "Log each stop — just the odometer",
    body: "At every stop, tap Log Stop, choose the place and type the new reading. We do the math — distance and claimable kilometres are worked out for you.",
  },
  {
    icon: <CalendarIcon width={30} height={30} />,
    title: "Month-end reports in one tap",
    body: "When the month ends, open History & Reports and share a PDF, Excel or CSV claim in the same layout as your spreadsheet.",
  },
];

export default function Tour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step] ?? STEPS[0]!;
  const isLast = step === STEPS.length - 1;

  return (
    <BottomSheet open onClose={onClose} title={current.title}>
      <div className="tour-body">
        <span className="tour-icon">{current.icon}</span>
        <p className="tour-text">{current.body}</p>
        <p className="sr-only" role="status">
          Step {step + 1} of {STEPS.length}
        </p>
        <div className="tour-dots" aria-hidden="true">
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={`tour-dot${index === step ? " tour-dot--active" : ""}`}
            />
          ))}
        </div>
        <div className="tour-actions">
          {isLast ? (
            <span className="tour-actions-spacer" />
          ) : (
            <Button variant="text" onClick={onClose}>
              Skip
            </Button>
          )}
          {isLast ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <Button onClick={() => setStep(step + 1)}>Next</Button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
