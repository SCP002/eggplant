import { expect, test } from "@playwright/test"

test("send chat message", async ({ page, request: apiRequest }) => {
  const email = `pw-test-${Date.now()}@example.com`
  const username = `pwuser${Date.now()}`
  const password = "password123"

  // Create a user via test-only backend endpoint and receive an access token
  const resp = await apiRequest.post(
    `http://localhost:8000/api/test/create_user`,
    {
      form: { email, username, password },
    },
  )
  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  const token = body.access_token as string
  const roomId = body.room_id as number

  // Ensure token stored in localStorage before app loads
  await page.addInitScript((t: string) => {
    window.localStorage.setItem("token", t)
  }, token)

  // Navigate directly to the room route so websocket connection targets the
  // correct room immediately.
  await page.goto(`http://localhost:3000/rooms/${roomId}`)

  // Wait for textarea to be visible
  const textarea = page.getByPlaceholder("Type a message...")
  await expect(textarea).toBeVisible({ timeout: 5000 })

  const testMessage = "Hello from Playwright " + Date.now()

  await textarea.fill(testMessage)

  const sendBtn = page.getByRole("button", { name: "Send" })
  await expect(sendBtn).toBeEnabled()
  await sendBtn.click()

  // Wait for the message to appear in the chat UI. The backend sends the new
  // message over websocket which the frontend app appends to the list.
  const messageLocator = page.getByText(testMessage, { exact: true })

  await expect(messageLocator).toBeVisible({ timeout: 5000 })
})

test("reply to message", async ({ page, request: apiRequest }) => {
  const email = `pw-test-reply-${Date.now()}@example.com`
  const username = `pwreply${Date.now()}`
  const password = "password123"

  const resp = await apiRequest.post(
    `http://localhost:8000/api/test/create_user`,
    {
      form: { email, username, password },
    },
  )
  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  const token = body.access_token as string
  const roomId = body.room_id as number

  await page.addInitScript((t: string) => {
    window.localStorage.setItem("token", t)
  }, token)

  await page.goto(`http://localhost:3000/rooms/${roomId}`)

  const textarea = page.getByPlaceholder("Type a message...")
  await expect(textarea).toBeVisible({ timeout: 5000 })

  const parentMessage = "Parent message " + Date.now()
  await textarea.fill(parentMessage)
  await page.getByRole("button", { name: "Send" }).click()
  await expect(page.getByText(parentMessage, { exact: true })).toBeVisible({
    timeout: 5000,
  })

  const replyButton = page
    .getByRole("button", { name: "Reply to message" })
    .first()
  await replyButton.click()

  const replyMessage = "Reply message " + Date.now()
  await textarea.fill(replyMessage)
  await page.getByRole("button", { name: "Send" }).click()

  await expect(page.getByText(replyMessage, { exact: true })).toBeVisible({
    timeout: 5000,
  })
  await expect(page.getByText("Replying to", { exact: false })).toBeVisible({
    timeout: 5000,
  })
})
