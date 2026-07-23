import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client"

export async function requestMicPermission(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  stream.getTracks().forEach((track) => track.stop())
}

export type ConnectToCallOptions = {
  url: string
  token: string
  onDisconnected?: () => void
}

/**
 * Connects to a LiveKit room, publishes the local microphone and attaches
 * remote audio tracks to a persistent <audio> element.
 */
export async function connectToCall(opts: ConnectToCallOptions): Promise<Room> {
  const room = new Room()
  const audioEl = document.createElement("audio")
  audioEl.autoplay = true
  document.body.appendChild(audioEl)

  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Audio) {
      track.attach(audioEl)
      void audioEl.play().catch(() => {
        // Autoplay may be blocked; audio resumes after a user gesture.
      })
    }
  })
  room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Audio) {
      track.detach()
    }
  })
  room.on(RoomEvent.Disconnected, () => {
    cleanupAudioElement(audioEl)
    opts.onDisconnected?.()
  })

  await room.connect(opts.url, opts.token, { autoSubscribe: true })
  try {
    await room.localParticipant.setMicrophoneEnabled(true)
  } catch {
    // No microphone or permission denied: still join to listen.
  }
  return room
}

function cleanupAudioElement(el: HTMLAudioElement): void {
  el.pause()
  el.srcObject = null
  el.remove()
}

export function leaveLiveKit(room: Room | null): void {
  if (!room) return
  void room.disconnect()
}

export async function setMicMuted(
  room: Room | null,
  muted: boolean,
): Promise<void> {
  if (!room) return
  await room.localParticipant.setMicrophoneEnabled(!muted)
}
