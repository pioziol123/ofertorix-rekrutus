/**
 * The repository's plugins index as the worker runs it, with only OpenAI
 * simulated by its transport in the pool processes: the AI module plugin
 * registers the receivers of Profile, Matching and Companies, the job
 * handler and the failure handler (B6 Verification). The simulated OpenAI
 * answers an assessment with every criterion unknown and never answers any
 * other call, so that work's attempt passes its time limit.
 */
import type { HandlerRegistry } from '../../../lib/workers/index.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { openAiProvider } from '../../../modules/ai/infrastructure/adapters/openai.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { registerProviderAdapter } from '../../../modules/ai/provider-registry.ts'
import { runModulePlugins as runRepositoryPlugins } from '../../../plugins/index.ts'
import { responseBody, unknownAssessment } from '../../matching-ai.fixtures.ts'

type Body = {
  input: { content: { text: string }[] }[]
  text?: { format?: { name?: string } }
}

async function simulatedOpenAi(_url: RequestInfo | URL, init?: RequestInit) {
  const body = JSON.parse(String(init?.body)) as Body
  if (body.text?.format?.name !== 'offer_assessment')
    return new Promise<Response>(() => {})
  const input = JSON.parse(body.input[0]!.content[0]!.text)
  return Response.json(responseBody(JSON.stringify(unknownAssessment(input))))
}

export async function runModulePlugins(
  registry: HandlerRegistry,
): Promise<void> {
  registerProviderAdapter(openAiProvider(simulatedOpenAi as typeof fetch))
  await runRepositoryPlugins(registry)
}
