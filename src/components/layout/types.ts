/** The signed-in user as the layout needs it. */
export interface LayoutUser {
  name: string;
  username: string | null;
  image: string | null;
  isAdmin: boolean;
  isSeller: boolean;
  unreadNotifications: number;
  /** Set while an account deletion is pending (ISO); shows the cancel banner. */
  deletionScheduledFor: string | null;
}
