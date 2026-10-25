import styles from "./WelcomeFeatures.module.css";

// Квадратная сцена с иллюстрацией расписания.
// Контейнер оставлен Lottie-ready: SVG можно заменить JSON-анимацией,
// сохранив тот же квадрат и композицию первого экрана.
// compact — для первого шага, где фиолетовый блок ниже и места под иллюстрацию меньше.
export default function WelcomeFeatures({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`${styles.stage} ${compact ? styles.stageCompact : ""}`}
      data-onboarding-features
      aria-label="Иллюстрация приложения"
    >
      <div className={styles.slot} data-lottie-slot="welcome-square" role="img" aria-label="Расписание тренера">
        <span className={styles.aura} />
        <svg className={styles.art} viewBox="0 0 240 240" fill="none" aria-hidden="true">
          <g className={styles.calendar}>
            <rect x="34" y="35" width="172" height="172" rx="25" fill="#fff" />
            <rect x="34.75" y="35.75" width="170.5" height="170.5" rx="24.25" stroke="#E5E8F5" strokeWidth="1.5" />
            <circle cx="56" cy="57" r="3" fill="#AAB3D4" />
            <circle cx="67" cy="57" r="3" fill="#C5CBE0" />
            <circle cx="78" cy="57" r="3" fill="#D9DDED" />
            <rect x="52" y="72" width="63" height="6" rx="3" fill="#E8EAF5" />
            <rect x="52" y="83" width="42" height="4" rx="2" fill="#F0F1F8" />
            <path d="M51 105H190M51 139H190M51 173H190" stroke="#ECEEF7" strokeWidth="2" />
            <rect x="68" y="95" width="89" height="22" rx="8" fill="url(#eventBlue)" />
            <rect x="101" y="129" width="79" height="22" rx="8" fill="#B5BEFF" />
            <rect x="57" y="163" width="102" height="21" rx="8" fill="#DDF7EA" />
            <path d="M166 178L173 185L188 167" stroke="#25AD6A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <g className={styles.floatingBadge}>
            <rect x="151" y="24" width="63" height="31" rx="15.5" fill="url(#badgeBlue)" stroke="#fff" strokeWidth="3" />
            <circle cx="167" cy="39.5" r="4" fill="#fff" />
            <rect x="176" y="37" width="26" height="5" rx="2.5" fill="#fff" opacity=".95" />
          </g>
          <circle className={styles.sparkle} cx="30" cy="112" r="6" fill="#9BA5FF" />
          <defs>
            <linearGradient id="eventBlue" x1="68" y1="95" x2="157" y2="117" gradientUnits="userSpaceOnUse">
              <stop stopColor="#4A5BF0" />
              <stop offset=".43" stopColor="#5262F7" />
              <stop offset="1" stopColor="#8994FF" />
            </linearGradient>
            <linearGradient id="badgeBlue" x1="151" y1="24" x2="214" y2="55" gradientUnits="userSpaceOnUse">
              <stop stopColor="#4A5BF0" />
              <stop offset="1" stopColor="#8994FF" />
            </linearGradient>
          </defs>
        </svg>
        <span className={styles.caption}>Тренерский день — собран</span>
      </div>
    </div>
  );
}
