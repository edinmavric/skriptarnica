/** Per-user counters for the header. Seller status and notifications are added by later phases. */
export async function getLayoutCounters(
  _userId: string,
): Promise<{ isSeller: boolean; unreadNotifications: number }> {
  return { isSeller: false, unreadNotifications: 0 };
}
