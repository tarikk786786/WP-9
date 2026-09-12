export interface QuietHoursConfig {
  startHour: number; // e.g. 22 (10 PM)
  endHour: number; // e.g. 8 (8 AM)
  timezone: string;
}

export const DEFAULT_QUIET_HOURS: QuietHoursConfig = {
  startHour: 22,
  endHour: 8,
  timezone: "Asia/Kolkata",
};

export class QuietHoursEngine {
  public isQuietTime(now = new Date(), config = DEFAULT_QUIET_HOURS): boolean {
    const hours = now.getHours(); // Local worker runtime hour
    if (config.startHour > config.endHour) {
      // Over midnight: e.g. 22 to 8
      return hours >= config.startHour || hours < config.endHour;
    }
    return hours >= config.startHour && hours < config.endHour;
  }
}

export const quietHoursEngine = new QuietHoursEngine();
