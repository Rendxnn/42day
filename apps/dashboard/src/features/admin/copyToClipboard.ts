export async function copyTextToClipboard(value: string, clipboard: Pick<Clipboard, "writeText"> = navigator.clipboard): Promise<void> {
  await clipboard.writeText(value);
}
