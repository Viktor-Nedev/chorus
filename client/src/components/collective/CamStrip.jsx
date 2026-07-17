import { useEffect, useRef } from 'react';

const hsl = (c) => (c ? `hsl(${c.h}, ${c.s}%, ${c.l}%)` : '#888');

// Живи камери в Shared Canvas режима: всеки праща малък JPEG кадър ~1/s
// през сокета (без WebRTC), останалите ги виждат като тайлове.
export function CamStrip({ socket, videoRef, users, myNickname, myColor }) {
  const myTileRef = useRef(null);

  useEffect(() => {
    const snap = document.createElement('canvas');
    snap.width = 160;
    snap.height = 120;
    const ctx = snap.getContext('2d');

    const id = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      // Огледално, както се очаква от селфи камера
      ctx.save();
      ctx.translate(snap.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, snap.width, snap.height);
      ctx.restore();
      const jpg = snap.toDataURL('image/jpeg', 0.5);
      socket.sendCamFrame(jpg);
      // Собствен тайл — локално, без мрежа
      if (myTileRef.current) myTileRef.current.src = jpg;
    }, 1200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const others = Object.values(users);

  return (
    <div className="absolute right-4 top-16 z-20 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
      {/* Моята камера */}
      <div className="relative rounded-xl overflow-hidden border-2 shadow-lg" style={{ borderColor: hsl(myColor) }}>
        <img ref={myTileRef} alt="you" className="w-32 aspect-[4/3] object-cover bg-ink" />
        <span className="absolute bottom-0 inset-x-0 bg-black/60 px-1.5 py-0.5 text-[9px] text-white truncate">
          {myNickname} (you)
        </span>
      </div>
      {/* Останалите */}
      {others.map((u) => (
        <div
          key={u.userId}
          className="relative rounded-xl overflow-hidden border-2 shadow-lg"
          style={{ borderColor: hsl(u.baseColor) }}
        >
          {socket.camFrames[u.userId] ? (
            <img src={socket.camFrames[u.userId]} alt={u.nickname} className="w-32 aspect-[4/3] object-cover bg-ink" />
          ) : (
            <div className="w-32 aspect-[4/3] bg-ink flex items-center justify-center text-gray-600 text-xl">
              📷
            </div>
          )}
          <span className="absolute bottom-0 inset-x-0 bg-black/60 px-1.5 py-0.5 text-[9px] text-white truncate">
            {u.nickname}
          </span>
        </div>
      ))}
    </div>
  );
}
