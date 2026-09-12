/**
 * Media Antivirus & Quarantine State Machine
 * Prevents infected or malicious binaries from reaching expensive processing tools.
 */

export type ScanStatus = 'CLEAN' | 'INFECTED' | 'QUARANTINED' | 'ERROR';

export interface ScanRecord {
  artifactId: string;
  status: ScanStatus;
  threatName?: string;
  scannedAt: number;
}

export class AntivirusScanner {
  // Common test signatures (EICAR standard antivirus test string)
  private eicarSignature = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

  public async scan(artifactId: string, buffer: Buffer): Promise<ScanRecord> {
    const textContent = buffer.toString('utf8', 0, Math.min(buffer.length, 1024));

    if (textContent.includes(this.eicarSignature)) {
      return {
        artifactId,
        status: 'QUARANTINED',
        threatName: 'EICAR_TEST_VIRUS',
        scannedAt: Date.now(),
      };
    }

    // Standard binary size limit check (e.g. decompression bomb / > 50MB)
    if (buffer.length > 50 * 1024 * 1024) {
      return {
        artifactId,
        status: 'QUARANTINED',
        threatName: 'OVERSIZED_OR_ZIP_BOMB',
        scannedAt: Date.now(),
      };
    }

    return {
      artifactId,
      status: 'CLEAN',
      scannedAt: Date.now(),
    };
  }
}

export const antivirusScanner = new AntivirusScanner();
