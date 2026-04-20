// Minimal typings for Telegram Web App SDK.
// Reference: https://core.telegram.org/bots/webapps

export {};

declare global {
  interface TelegramWebAppUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    photo_url?: string;
  }

  interface TelegramThemeParams {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
    header_bg_color?: string;
    accent_text_color?: string;
    destructive_text_color?: string;
  }

  interface TelegramHapticFeedback {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  }

  interface TelegramBackButton {
    isVisible: boolean;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  }

  interface TelegramMainButton {
    text: string;
    isVisible: boolean;
    isActive: boolean;
    setText(text: string): void;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
    setParams(params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }): void;
  }

  interface TelegramWebApp {
    initData: string;
    initDataUnsafe: {
      user?: TelegramWebAppUser;
      auth_date?: number;
      hash?: string;
      start_param?: string;
    };
    version: string;
    platform: string;
    colorScheme: "light" | "dark";
    themeParams: TelegramThemeParams;
    viewportHeight: number;
    viewportStableHeight: number;
    headerColor: string;
    backgroundColor: string;
    BackButton: TelegramBackButton;
    MainButton: TelegramMainButton;
    HapticFeedback: TelegramHapticFeedback;
    ready(): void;
    expand(): void;
    close(): void;
    showAlert(message: string, cb?: () => void): void;
    showConfirm(message: string, cb: (ok: boolean) => void): void;
    openLink(url: string, options?: { try_instant_view?: boolean }): void;
    openTelegramLink(url: string): void;
    setHeaderColor(c: "bg_color" | "secondary_bg_color" | string): void;
    setBackgroundColor(c: "bg_color" | "secondary_bg_color" | string): void;
    onEvent(event: string, cb: (...args: unknown[]) => void): void;
    offEvent(event: string, cb: (...args: unknown[]) => void): void;
  }

  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}
