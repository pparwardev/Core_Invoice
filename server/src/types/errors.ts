export class ValidationError extends Error {
  constructor(public field: string, public expectedFormat: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class BusinessRuleError extends Error {
  constructor(public rule: string, public suggestion: string, message: string) {
    super(message);
    this.name = 'BusinessRuleError';
  }
}
