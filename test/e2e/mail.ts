import { expect } from '@playwright/test'

interface MailpitMessage {
  ID: string
  To: { Address: string }[]
}

// The link of the latest password reset email sent to `address`, from the local Mailpit mailbox. Its site
// URL is the local config's (port 3000): it is rebased on the site under test.
export async function passwordResetLink(address: string, baseURL: string): Promise<string> {
  const mailpit = process.env.E2E_MAILPIT_URL!
  let message: MailpitMessage | undefined
  await expect.poll(async () => {
    const { messages } = await (await fetch(`${mailpit}/api/v1/messages?limit=50`)).json() as { messages: MailpitMessage[] }
    message = messages.find(m => m.To.some(to => to.Address === address))
    return !!message
  }, { message: `aucun e-mail pour ${address}` }).toBe(true)

  const { HTML } = await (await fetch(`${mailpit}/api/v1/message/${message!.ID}`)).json() as { HTML: string }
  const href = HTML.match(/href="([^"]*\/reset-password\?[^"]*)"/)?.[1]
  expect(href, 'lien de réinitialisation').toBeTruthy()
  const link = new URL(href!.replaceAll('&amp;', '&'))
  return `${baseURL}${link.pathname}${link.search}`
}
