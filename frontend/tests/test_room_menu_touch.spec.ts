import {
  type APIRequestContext,
  type Page,
  devices,
  expect,
  test,
} from "@playwright/test"

test.use({ ...devices["Pixel 5"] })
test.setTimeout(120_000)
// Touch emulation (hasTouch/isMobile) is only supported in Chromium.
test.skip(({ browserName }) => browserName !== "chromium")

interface CreatedUser {
  access_token: string
  room_id: number
}

async function createUser(
  request: APIRequestContext,
  email: string,
  username: string,
): Promise<CreatedUser> {
  const res = await request.post("http://localhost:8000/api/test/create_user", {
    form: { email, username, password: "password123" },
  })
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as CreatedUser
}

async function authUser(page: Page, token: string): Promise<void> {
  await page.addInitScript((t: string) => {
    window.localStorage.setItem("token", t)
  }, token)
}

/**
 * Opens the app, waits for it to settle, then makes sure the rooms list is
 * shown (mobile layout). The app auto-opens the general room in chat view on
 * mobile once the room list arrives, so go back if needed.
 */
async function openRoomsList(page: Page, roomId: number): Promise<void> {
  await page.goto(`http://localhost:3000/rooms/${roomId}`, {
    waitUntil: "domcontentloaded",
  })
  const backButton = page.locator("button.md\\:hidden").first()
  await expect(backButton).toBeVisible({ timeout: 20000 }).catch(() => {})
  if (await backButton.isVisible().catch(() => false)) {
    await backButton.tap()
  }
  // Ensure the room list actually rendered before interacting with it.
  await expect(
    page.getByRole("button", { name: "Create room" }),
  ).toBeVisible({ timeout: 10000 })
}

test("closing a DM from its menu shows the confirm dialog without navigating", async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString()
  const a = await createUser(request, `close-a-${suffix}@example.com`, `closea${suffix}`)
  const b = await createUser(request, `close-b-${suffix}@example.com`, `closeb${suffix}`)

  const meB = await request.get("http://localhost:8000/api/me", {
    headers: { authorization: `Bearer ${b.access_token}` },
  })
  const bId = (await meB.json()).id
  const dm = await request.post(`http://localhost:8000/api/dms/${bId}`, {
    headers: { authorization: `Bearer ${a.access_token}` },
  })
  expect(dm.ok()).toBeTruthy()

  await authUser(page, a.access_token)
  await openRoomsList(page, a.room_id)
  const urlBefore = page.url()

  const kebab = page.getByRole("button", {
    name: `Open actions for closeb${suffix}`,
  })
  await expect(kebab).toBeVisible({ timeout: 5000 })
  await kebab.tap()
  await page.getByRole("menuitem", { name: "Close Chat" }).tap()

  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 })
  expect(page.url()).toBe(urlBefore)
})

test("leaving a group room from its menu shows the confirm dialog without navigating", async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString()
  const owner = await createUser(request, `owner-${suffix}@example.com`, `owner${suffix}`)
  const member = await createUser(request, `member-${suffix}@example.com`, `member${suffix}`)

  const room = await request.post("http://localhost:8000/api/rooms", {
    headers: { authorization: `Bearer ${owner.access_token}` },
    data: { name: `Group ${suffix}` },
  })
  expect(room.ok()).toBeTruthy()
  const roomId = (await room.json()).id

  const meM = await request.get("http://localhost:8000/api/me", {
    headers: { authorization: `Bearer ${member.access_token}` },
  })
  const memberId = (await meM.json()).id
  const inv = await request.post(
    `http://localhost:8000/api/rooms/${roomId}/invitations`,
    {
      headers: { authorization: `Bearer ${owner.access_token}` },
      data: { invitee_id: memberId },
    },
  )
  expect(inv.ok()).toBeTruthy()
  const invBody = await inv.json()
  const accept = await request.post(
    `http://localhost:8000/api/invitations/${invBody.token}/accept`,
    {
      headers: { authorization: `Bearer ${member.access_token}` },
    },
  )
  expect(accept.ok()).toBeTruthy()

  await authUser(page, member.access_token)
  await openRoomsList(page, member.room_id)
  const urlBefore = page.url()

  const kebab = page.getByRole("button", {
    name: `Open actions for Group ${suffix}`,
  })
  await expect(kebab).toBeVisible({ timeout: 5000 })
  await kebab.tap()
  await page.getByRole("menuitem", { name: "Leave Room" }).tap()

  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 })
  expect(page.url()).toBe(urlBefore)
})
