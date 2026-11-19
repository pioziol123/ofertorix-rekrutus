/** The command conflicts with the current state, or its id was reused. */
export class CompanyConflict extends Error {}
/** The company or the ad does not exist. */
export class CompanyNotFound extends Error {}
