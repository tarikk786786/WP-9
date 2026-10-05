/**
 * Transparent AI Identification and Consent Guard
 * Requirement 7: Do not falsely claim "I am Tarik" when the speaker is an AI.
 * Requirement 26: Call recording disabled by default.
 */

export class CallConsentManager {
  private disclosureText: string;
  private recordingConsentGiven = false;

  constructor(
    disclosureText = "Namaste, main AI assistant hoon. Main aapki baat sun kar help kar sakta hoon."
  ) {
    this.disclosureText = disclosureText;
  }

  public getDisclosureText(): string {
    return this.disclosureText;
  }

  public setDisclosureText(text: string): void {
    this.disclosureText = text;
  }

  /**
   * Requirement 26: Call Recording is strictly disabled by default.
   * Only metadata (duration, latency, turns) may be retained.
   */
  public isRecordingAllowed(): boolean {
    return this.recordingConsentGiven;
  }

  public grantRecordingConsent(): void {
    this.recordingConsentGiven = true;
  }

  public revokeRecordingConsent(): void {
    this.recordingConsentGiven = false;
  }
}
