/** Who is acting on a feedback thread; roles are assigned by the server, never the caller. */
export type ReplyActor =
  { kind: 'admin'; network: string } | { kind: 'visitor'; visitorId: string; network: string };

export type ReplyAccess = {
  role: 'admin' | 'author' | 'reader';
  canReply: boolean;
  privateView: boolean;
};
