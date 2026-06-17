export function isMaintenanceConfirmed(argv: string[]): boolean {
  return argv.includes("--yes");
}

export function requireMaintenanceConfirmation(argv: string[], scriptName: string): void {
  if (isMaintenanceConfirmed(argv)) {
    return;
  }

  throw new Error(`${scriptName} is a destructive maintenance script. Re-run with --yes to continue.`);
}
