import LottiePlayer from "@/components/ui/LottiePlayer";
import styles from "./WelcomeFeatures.module.css";

// Анимация PragmaBox из src/components/ui/lotties. Грузится отдельным чанком
// только на этом экране. Функция объявлена вне компонента, чтобы анимация
// не перезапускалась при перерисовке онбординга.
const loadWelcomeAnimation = () => import("@/components/ui/lotties/Pragmabox.json");

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
        <LottiePlayer load={loadWelcomeAnimation} className={styles.lottie} />
      </div>
    </div>
  );
}
