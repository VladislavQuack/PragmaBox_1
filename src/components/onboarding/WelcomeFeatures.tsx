import LottiePlayer from "@/components/ui/LottiePlayer";
import { loadPragmaboxAnimation } from "@/components/ui/lotties";
import styles from "./WelcomeFeatures.module.css";

// Квадратная сцена первого экрана с зацикленной Lottie-анимацией.
// compact — для первого шага, где фиолетовый блок ниже и места под анимацию меньше.
export default function WelcomeFeatures({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`${styles.stage} ${compact ? styles.stageCompact : ""}`}
      data-onboarding-features
      aria-label="Иллюстрация приложения"
    >
      <div className={styles.slot} data-lottie-slot="welcome-square" role="img" aria-label="Анимация PragmaBox">
        <LottiePlayer load={loadPragmaboxAnimation} className={styles.lottie} />
      </div>
    </div>
  );
}
