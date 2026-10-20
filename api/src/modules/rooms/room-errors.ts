/** A join refusal whose message is safe and useful to show the visitor. */
export class JoinRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JoinRejectedError';
  }
}

export class SiteAgreementRequiredError extends Error {
  constructor() {
    super('Agree to the site use agreement before joining a room.');
    this.name = 'SiteAgreementRequiredError';
  }
}

/** Refused when the site password protects room creation and was not entered. */
export class SitePasswordRequiredError extends JoinRejectedError {
  constructor() {
    super('Enter the site password to create a room.');
    this.name = 'SitePasswordRequiredError';
  }
}
