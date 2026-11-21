import { registerAssignmentReceivers } from '../../receivers/index'

// Registers the receivers of assignments at server start, so that an end of
// an assignment decided here, such as the owner's Reject, reaches its
// requesting module (epic sq2, T6). A second registration of a settings
// name stops the server. The module plugins are not run here.
export default defineNitroPlugin(() => {
  registerAssignmentReceivers()
})
