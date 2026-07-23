import { expect, test } from "@playwright/test"

test("call button is hidden in the General room and shown in normal rooms", async ({
  page,
  request: apiRequest,
}) => {
  const email = `pw-call-${Date.now()}@example.com`
  const username = `pwcall${Date.now()}`
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
  const generalRoomId = body.room_id as number

  await page.addInitScript((t: string) => {
    window.localStorage.setItem("token", t)
  }, token)

  // The General room must not offer a call button.
  await page.goto(`http://localhost:3000/rooms/${generalRoomId}`)
  const textarea = page.getByPlaceholder("Type a message...")
  await expect(textarea).toBeVisible({ timeout: 5000 })
  await expect(page.getByTitle("Start voice call")).toHaveCount(0)

  // A normal room must show the call button in the header.
  const createRoom = await apiRequest.post(`http://localhost:8000/api/rooms`, {
    headers: { authorization: `Bearer ${token}` },
    form: { name: "Call Test Room" },
  })
  expect(createRoom.ok()).toBeTruthy()
  const room = (await createRoom.json()) as { id: number }

  await page.goto(`http://localhost:3000/rooms/${room.id}`)
  await expect(page.getByTitle("Start voice call")).toBeVisible({
    timeout: 5000,
  })
})
