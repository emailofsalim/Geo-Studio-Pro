import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sensorManager } from '../sensorResourceManager';

// The manager is a singleton, so each test releases everything first.
beforeEach(() => {
  sensorManager.releaseAllHardwareResources('test reset');
  sensorManager.clearAuditLog();
});

describe('sensor manager — NFC', () => {
  it('reports an NFC scan as active and returns an abort controller', () => {
    const abort = sensorManager.acquireNfcScan('t_nfc', 'Test NFC feature');
    expect(abort).toBeInstanceOf(AbortController);

    const snap = sensorManager.getSnapshot();
    expect(snap.nfc.active).toBe(true);
    expect(snap.nfc.consumerCount).toBe(1);
    expect(snap.nfc.consumers[0].featureName).toBe('Test NFC feature');
  });

  it('aborts the scan signal on release', () => {
    const abort = sensorManager.acquireNfcScan('t_nfc', 'Test NFC feature');
    expect(abort.signal.aborted).toBe(false);

    sensorManager.releaseNfcScan('t_nfc');
    expect(abort.signal.aborted).toBe(true);
    expect(sensorManager.getSnapshot().nfc.active).toBe(false);
  });

  it('returns the same controller when the same consumer re-acquires', () => {
    const a = sensorManager.acquireNfcScan('t_nfc', 'Test NFC feature');
    const b = sensorManager.acquireNfcScan('t_nfc', 'Test NFC feature');
    expect(b).toBe(a);
    expect(sensorManager.getSnapshot().nfc.consumerCount).toBe(1);
  });

  it('records acquire and release in the audit log', () => {
    sensorManager.acquireNfcScan('t_nfc', 'Test NFC feature');
    sensorManager.releaseNfcScan('t_nfc', 'done');
    const kinds = sensorManager.getAuditLog().filter(e => e.resourceType === 'nfc').map(e => e.action);
    expect(kinds).toContain('ACQUIRE');
    expect(kinds).toContain('RELEASE');
  });

  it('ignores a release for a consumer that never acquired', () => {
    expect(() => sensorManager.releaseNfcScan('never')).not.toThrow();
  });
});

describe('sensor manager — serial', () => {
  it('reports an open port and names it', () => {
    sensorManager.registerSerialPort('t_ser', 'Total station link', { close: vi.fn() }, 'USB 1027:24577');
    const snap = sensorManager.getSnapshot();
    expect(snap.serial.active).toBe(true);
    expect(snap.serial.portName).toBe('USB 1027:24577');
  });

  it('closes the underlying port on release', () => {
    const close = vi.fn().mockResolvedValue(undefined);
    sensorManager.registerSerialPort('t_ser', 'Total station link', { close });
    sensorManager.releaseSerialPort('t_ser');
    expect(close).toHaveBeenCalledTimes(1);
    expect(sensorManager.getSnapshot().serial.active).toBe(false);
  });

  it('survives a port whose close throws', () => {
    const close = vi.fn(() => {
      throw new Error('device already gone');
    });
    sensorManager.registerSerialPort('t_ser', 'Total station link', { close });
    expect(() => sensorManager.releaseSerialPort('t_ser')).not.toThrow();
    expect(sensorManager.getSnapshot().serial.active).toBe(false);
  });
});

describe('sensor manager — HID', () => {
  it('reports a claimed device and names it', () => {
    sensorManager.registerHidDevice('t_hid', 'Survey controller', { close: vi.fn() }, 'SpaceMouse Pro');
    const snap = sensorManager.getSnapshot();
    expect(snap.hid.active).toBe(true);
    expect(snap.hid.deviceName).toBe('SpaceMouse Pro');
  });

  it('closes the device on release', () => {
    const close = vi.fn().mockResolvedValue(undefined);
    sensorManager.registerHidDevice('t_hid', 'Survey controller', { close });
    sensorManager.releaseHidDevice('t_hid');
    expect(close).toHaveBeenCalledTimes(1);
    expect(sensorManager.getSnapshot().hid.active).toBe(false);
  });
});

describe('sensor manager — the kill switch covers everything', () => {
  it('stops NFC, serial and HID as well as the older resources', () => {
    // Before this change these three reached the device APIs directly, so the
    // master kill switch left an NFC scan running, a serial port open and an
    // HID device claimed.
    const abort = sensorManager.acquireNfcScan('k_nfc', 'NFC');
    const serialClose = vi.fn().mockResolvedValue(undefined);
    const hidClose = vi.fn().mockResolvedValue(undefined);
    sensorManager.registerSerialPort('k_ser', 'Serial', { close: serialClose });
    sensorManager.registerHidDevice('k_hid', 'HID', { close: hidClose });

    expect(sensorManager.getSnapshot().totalActiveResources).toBe(3);

    sensorManager.releaseAllHardwareResources('kill switch test');

    expect(abort.signal.aborted).toBe(true);
    expect(serialClose).toHaveBeenCalled();
    expect(hidClose).toHaveBeenCalled();

    const snap = sensorManager.getSnapshot();
    expect(snap.nfc.active).toBe(false);
    expect(snap.serial.active).toBe(false);
    expect(snap.hid.active).toBe(false);
    expect(snap.totalActiveResources).toBe(0);
  });

  it('counts each distinct resource type once in the active total', () => {
    sensorManager.acquireNfcScan('a', 'A');
    sensorManager.acquireNfcScan('b', 'B');
    expect(sensorManager.getSnapshot().nfc.consumerCount).toBe(2);
    expect(sensorManager.getSnapshot().totalActiveResources).toBe(1);
  });
});

describe('sensor manager — privacy by default', () => {
  it('reports nothing active before any feature asks for a resource', () => {
    const snap = sensorManager.getSnapshot();
    expect(snap.totalActiveResources).toBe(0);
    for (const key of ['camera', 'microphone', 'geolocation', 'orientation', 'motion', 'bluetooth', 'nfc', 'serial', 'hid', 'wakelock'] as const) {
      expect(snap[key].active).toBe(false);
    }
  });

  it('notifies subscribers when a resource changes state', () => {
    const seen: number[] = [];
    const unsubscribe = sensorManager.subscribe(s => seen.push(s.totalActiveResources));
    sensorManager.acquireNfcScan('s_nfc', 'NFC');
    sensorManager.releaseNfcScan('s_nfc');
    unsubscribe();
    expect(seen).toContain(1);
    expect(seen[seen.length - 1]).toBe(0);
  });
});
