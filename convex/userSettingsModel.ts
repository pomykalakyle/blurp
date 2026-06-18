export const USER_SETTINGS_KEY = "default";

export type UserSettingsView = {
  displayName: string;
  aboutUser: string;
  timeZone: string;
  updatedAt: number | null;
};

export const DEFAULT_USER_SETTINGS: UserSettingsView = {
  displayName: "User",
  aboutUser: "",
  timeZone: "UTC",
  updatedAt: null,
};

export function normalizeUserSettings(
  settings: Partial<UserSettingsView> | null | undefined,
): UserSettingsView {
  return {
    displayName:
      settings?.displayName?.trim() || DEFAULT_USER_SETTINGS.displayName,
    aboutUser: settings?.aboutUser?.trim() ?? DEFAULT_USER_SETTINGS.aboutUser,
    timeZone: settings?.timeZone?.trim() || DEFAULT_USER_SETTINGS.timeZone,
    updatedAt: settings?.updatedAt ?? DEFAULT_USER_SETTINGS.updatedAt,
  };
}

export function userReference(settings: UserSettingsView): string {
  const name = settings.displayName.trim();
  return name && name.toLowerCase() !== "user" ? name : "the user";
}

export function userPossessive(settings: UserSettingsView): string {
  const ref = userReference(settings);
  if (ref === "the user") return "the user's";
  return ref.endsWith("s") ? `${ref}'` : `${ref}'s`;
}
