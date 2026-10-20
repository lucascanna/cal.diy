/**
 * The update payload carries only dirty fields, so `title` is absent when it did not change. The
 * form then holds the last saved title. The `eventType` prop cannot be used: the edit page does not
 * refetch it after a save, so it keeps the title the page was loaded with.
 */
export function getSavedEventTypeTitle({
  submittedTitle,
  formTitle,
}: {
  submittedTitle?: string;
  formTitle: string;
}): string {
  return submittedTitle ?? formTitle;
}
