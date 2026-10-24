import { BedDouble, Car, CarTaxiFront, Plane, Ship, TrainFront } from "lucide-react";
import type { TravelLeg } from "@/lib/ui/contract";
import { LegTag } from "../ui/tags";
import { Age } from "../time";
import styles from "./case.module.css";

const MODE_ICON = {
  FERRY: Ship,
  TRAIN: TrainFront,
  FLIGHT: Plane,
  HOTEL: BedDouble,
  DRIVE: Car,
  TAXI: CarTaxiFront,
} as const;

export function Travel({ legs }: { legs: TravelLeg[] }) {
  return (
    <section className={styles.panel} aria-labelledby="travel-title">
      <div className={styles.panelHead}>
        <h2 id="travel-title" className={`heading ${styles.panelTitle}`}>
          Travel
        </h2>
        <p className={styles.panelHint}>Quoted isn't booked.</p>
      </div>
      <ul className={styles.legs}>
        {legs.map((leg) => {
          const Icon = MODE_ICON[leg.mode];
          return (
            <li key={leg.id} className={styles.leg} data-state={leg.state}>
              <span className={styles.legIcon} aria-hidden="true">
                <Icon size={18} strokeWidth={1.6} />
              </span>
              <div className={styles.legBody}>
                <div className={styles.legTop}>
                  <span className={styles.legLabel}>{leg.label}</span>
                  <LegTag state={leg.state} />
                </div>
                <p className={styles.legWhen}>{leg.when}</p>
                <p className={styles.legDetail}>{leg.detail}</p>
                {(leg.reference || leg.checked_at) && (
                  <p className={styles.legFoot}>
                    {leg.reference && <span className={styles.legRef}>Ref {leg.reference}</span>}
                    {leg.checked_at && <Age at={leg.checked_at} prefix="checked " />}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
