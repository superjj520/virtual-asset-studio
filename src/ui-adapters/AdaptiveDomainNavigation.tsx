import {
  BookOpenIcon,
  CubeIcon,
  FilmSlateIcon,
  SparkleIcon,
  type IconProps,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { useSyncExternalStore } from "react";

export type StudioDomain = "creation" | "assets" | "production" | "templates";

type AdaptiveDomainNavigationProps = {
  activeDomain: StudioDomain;
  connected: boolean;
  onNavigate: (domain: StudioDomain) => void;
  onOpenSettings: () => void;
};

const DOMAINS: Array<{
  domain: StudioDomain;
  label: string;
  Icon: ComponentType<IconProps>;
}> = [
  { domain: "creation", label: "创作", Icon: SparkleIcon },
  { domain: "assets", label: "资产", Icon: CubeIcon },
  { domain: "production", label: "生产", Icon: FilmSlateIcon },
  { domain: "templates", label: "模板", Icon: BookOpenIcon },
];

function getIsPhone() {
  return window.innerWidth < 768;
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("resize", onStoreChange);
  return () => window.removeEventListener("resize", onStoreChange);
}

/** 仅在导航骨架不同的时候判断可用宽度；其余排版由 CSS 媒体查询处理。 */
function usePhoneNavigation() {
  return useSyncExternalStore(subscribe, getIsPhone, () => false);
}

export function AdaptiveDomainNavigation({
  activeDomain,
  connected,
  onNavigate,
  onOpenSettings,
}: AdaptiveDomainNavigationProps) {
  const isPhone = usePhoneNavigation();

  if (isPhone) {
    return (
      <nav className="mobile-domain-nav" aria-label="移动端四个工作域">
        {DOMAINS.map(({ domain, label, Icon }) => (
          <button
            key={domain}
            type="button"
            aria-current={activeDomain === domain ? "page" : undefined}
            className={activeDomain === domain ? "nav-current" : ""}
            onClick={() => onNavigate(domain)}
          >
            <Icon aria-hidden="true" size={20} weight="duotone" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    );
  }

  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">VA</span>
        <div>
          <p className="eyebrow">工作台</p>
          <h1>虚拟资产创作工作台</h1>
        </div>
      </div>
      <p className="sidebar-section-label">工作域</p>
      <nav className="primary-nav" aria-label="四个工作域">
        {DOMAINS.map(({ domain, label, Icon }) => (
          <button
            key={domain}
            type="button"
            aria-current={activeDomain === domain ? "page" : undefined}
            className={activeDomain === domain ? "nav-current" : ""}
            onClick={() => onNavigate(domain)}
          >
            <Icon aria-hidden="true" size={18} weight="duotone" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button type="button" className="system-button" onClick={onOpenSettings}>设置</button>
        <p className={connected ? "status" : "status status-wait"}>
          {connected ? "本地服务已连接" : "正在连接本地工作区"}
        </p>
      </div>
    </aside>
  );
}
