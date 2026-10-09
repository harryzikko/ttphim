/**
 * KKPhim Watch Party Service
 * Manages real-time watch party rooms, player state synchronization,
 * live chat, and floating emoji reactions via Server-Sent Events (SSE).
 */

class PartyService {
  constructor() {
    // Map of roomCode -> room object
    this.rooms = new Map();

    // Auto-cleanup idle rooms every 10 minutes
    setInterval(() => this.cleanupIdleRooms(), 10 * 60 * 1000);
  }

  /**
   * Generate an easy-to-share 6-character room code (e.g. KP-8492)
   */
  generateRoomCode() {
    let code = '';
    do {
      const num = Math.floor(1000 + Math.random() * 9000);
      code = `KP-${num}`;
    } while (this.rooms.has(code));
    return code;
  }

  formatTime(date = new Date()) {
    try {
      return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'Vừa xong';
    }
  }

  /**
   * Strip non-serializable fields (like SSE streams) for client responses
   */
  getSafeRoom(room) {
    if (!room) return null;
    return {
      code: room.code,
      name: room.name,
      movieSlug: room.movieSlug,
      movieName: room.movieName,
      moviePoster: room.moviePoster,
      episodeSlug: room.episodeSlug,
      episodeName: room.episodeName,
      hostId: room.hostId,
      hostName: room.hostName,
      controlMode: room.controlMode, // 'host_only' | 'free_for_all'
      isPlaying: room.isPlaying,
      currentTime: room.currentTime,
      members: room.members,
      messages: room.messages,
      memberCount: room.members.length,
      createdAt: room.createdAt,
      lastActive: room.lastActive
    };
  }

  /**
   * Create a new Watch Party Room
   */
  createRoom({ movieSlug, movieName, moviePoster, episodeSlug, episodeName, user, roomName, controlMode }) {
    const code = this.generateRoomCode();
    const userId = user?.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const userName = user?.name || 'Chủ Phòng';
    const userAvatar = user?.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPbHo0WbRHUQwGQOjadraD_tAk7XQUGjJQPQDSvK5RZfRCVSUufHkI5ytr1RnoudWNDKzqxm86HwkNOfZhdJ6gH5wUBF8Hu6sx3uE-8dvCv61CH5Sl6_6rcVCCUeOGM4Ub3reCBWB2-ittRPKQslAi-yOnv0WlNzjOskqtQAYGefgmgohy9WNwv1lISujIp8aIK3M0rynROP6yxRZcTMSyWswRJsdzf7K4DhDzjq8';

    const hostMember = {
      id: userId,
      name: userName,
      avatar: userAvatar,
      isHost: true,
      joinedAt: Date.now()
    };

    const initialMessage = {
      id: `msg_${Date.now()}`,
      type: 'system',
      text: `🎉 Phòng xem chung đã được khởi tạo bởi ${userName}. Chúc các bạn xem phim vui vẻ!`,
      time: this.formatTime()
    };

    const room = {
      code,
      name: roomName || `Phòng xem: ${movieName || 'Phim'}`,
      movieSlug,
      movieName: movieName || 'Phim',
      moviePoster: moviePoster || '',
      episodeSlug: episodeSlug || '1',
      episodeName: episodeName || '1',
      hostId: userId,
      hostName: userName,
      controlMode: controlMode === 'free_for_all' ? 'free_for_all' : 'host_only',
      isPlaying: false,
      currentTime: 0,
      members: [hostMember],
      messages: [initialMessage],
      streams: new Map(), // userId -> Set of res objects
      createdAt: Date.now(),
      lastActive: Date.now()
    };

    this.rooms.set(code, room);
    console.log(`[WatchParty] Created room ${code} for movie ${movieSlug} by ${userName}`);
    return this.getSafeRoom(room);
  }

  /**
   * Find room by code (supports case-insensitive e.g. kp-8492 or KP-8492)
   */
  getRoom(code) {
    if (!code) return null;
    const normalized = String(code).trim().toUpperCase();
    return this.rooms.get(normalized) || null;
  }

  /**
   * Join an existing room
   */
  joinRoom(code, user) {
    const room = this.getRoom(code);
    if (!room) {
      throw new Error('Phòng xem chung không tồn tại hoặc đã kết thúc');
    }

    const userId = user?.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const userName = user?.name || `Khách #${Math.floor(100 + Math.random() * 900)}`;
    const userAvatar = user?.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDmV0kJ3rLlFchh-aGILVOr-pQbdtHs2qQKQtkeKftGRHjg2nb7ii3xkFe2aJA7-Gldl5BqHuj4L_uiVmqQyW9CCgKPrUz_MCzKjGtUsI1R3dM0r3vXdhkgOsKaL_SVbs9gl7b2sTWQGr3VphY1X_pUChBkXZ-KPQtC6HeaIV7uxpjuEKEltMKcvR78AOcVjnQlk989xeMDULyOev-eHEjgdEO-N14MVTh2oQR_E3A';

    let member = room.members.find(m => m.id === userId);
    const isNew = !member;

    if (!member) {
      member = {
        id: userId,
        name: userName,
        avatar: userAvatar,
        isHost: false,
        joinedAt: Date.now()
      };
      room.members.push(member);

      const joinMsg = {
        id: `msg_${Date.now()}`,
        type: 'system',
        text: `👋 ${userName} đã tham gia phòng xem chung.`,
        time: this.formatTime()
      };
      room.messages.push(joinMsg);
      if (room.messages.length > 100) room.messages.shift();

      this.broadcast(room.code, {
        type: 'member_joined',
        member,
        members: room.members,
        message: joinMsg
      });
    } else {
      // Update name/avatar if changed
      member.name = userName;
      member.avatar = userAvatar;
    }

    room.lastActive = Date.now();
    return { room: this.getSafeRoom(room), user: member };
  }

  /**
   * Leave a room
   */
  leaveRoom(code, userId) {
    const room = this.getRoom(code);
    if (!room) return null;

    const memberIdx = room.members.findIndex(m => m.id === userId);
    if (memberIdx === -1) return null;

    const leavingMember = room.members[memberIdx];
    const wasHost = leavingMember.isHost;
    room.members.splice(memberIdx, 1);

    // Remove user streams
    room.streams.delete(userId);

    const leaveMsg = {
      id: `msg_${Date.now()}`,
      type: 'system',
      text: `🚪 ${leavingMember.name} đã rời phòng.`,
      time: this.formatTime()
    };
    room.messages.push(leaveMsg);
    if (room.messages.length > 100) room.messages.shift();

    // If host left and members remain, promote next member to host
    let newHost = null;
    if (wasHost && room.members.length > 0) {
      room.members[0].isHost = true;
      room.hostId = room.members[0].id;
      room.hostName = room.members[0].name;
      newHost = room.members[0];

      const hostMsg = {
        id: `msg_host_${Date.now()}`,
        type: 'system',
        text: `👑 ${newHost.name} đã trở thành chủ phòng mới.`,
        time: this.formatTime()
      };
      room.messages.push(hostMsg);
    }

    room.lastActive = Date.now();

    this.broadcast(room.code, {
      type: 'member_left',
      userId,
      leavingName: leavingMember.name,
      members: room.members,
      newHost,
      message: leaveMsg
    });

    return { success: true };
  }

  /**
   * Synchronize video player state (play, pause, seek, change episode)
   */
  syncPlayer(code, userId, { action, currentTime, episodeSlug, episodeName }) {
    const room = this.getRoom(code);
    if (!room) {
      throw new Error('Phòng xem không tồn tại');
    }

    const member = room.members.find(m => m.id === userId);
    const isHost = member ? member.isHost : (room.hostId === userId);

    if (room.controlMode === 'host_only' && !isHost && action !== 'heartbeat') {
      throw new Error('Chỉ Chủ Phòng mới có quyền điều khiển phát phim');
    }

    const userName = member ? member.name : (isHost ? room.hostName : 'Thành viên');

    if (typeof currentTime === 'number' && !isNaN(currentTime)) {
      room.currentTime = Math.max(0, currentTime);
    }

    if (action === 'play') {
      room.isPlaying = true;
    } else if (action === 'pause') {
      room.isPlaying = false;
    } else if (action === 'change_episode') {
      if (episodeSlug) room.episodeSlug = episodeSlug;
      if (episodeName) room.episodeName = episodeName;
      room.currentTime = 0;
      room.isPlaying = true;
    }

    room.lastActive = Date.now();

    const syncPayload = {
      type: 'player_sync',
      action,
      currentTime: room.currentTime,
      episodeSlug: room.episodeSlug,
      episodeName: room.episodeName,
      isPlaying: room.isPlaying,
      senderId: userId,
      senderName: userName,
      timestamp: Date.now()
    };

    // System announcement in chat for important player actions
    let actionNotice = null;
    if (action === 'play') {
      actionNotice = `▶️ ${userName} đã tiếp tục phát video`;
    } else if (action === 'pause') {
      actionNotice = `⏸️ ${userName} đã tạm dừng video`;
    } else if (action === 'seek') {
      const m = Math.floor(room.currentTime / 60);
      const s = Math.floor(room.currentTime % 60);
      const timeStr = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
      actionNotice = `⏩ ${userName} đã tua đến ${timeStr}`;
    } else if (action === 'change_episode') {
      actionNotice = `🎬 ${userName} đã chuyển sang Tập ${room.episodeName}`;
    }

    if (actionNotice) {
      const sysMsg = {
        id: `msg_sync_${Date.now()}`,
        type: 'system',
        text: actionNotice,
        time: this.formatTime()
      };
      room.messages.push(sysMsg);
      if (room.messages.length > 100) room.messages.shift();
      syncPayload.systemMessage = sysMsg;
    }

    this.broadcast(room.code, syncPayload);
    return { success: true, room: this.getSafeRoom(room) };
  }

  /**
   * Send live party chat message
   */
  sendChat(code, userId, { content, userName, avatar }) {
    const room = this.getRoom(code);
    if (!room) throw new Error('Phòng xem không tồn tại');
    if (!content || !content.trim()) throw new Error('Nội dung tin nhắn không được để trống');

    const member = room.members.find(m => m.id === userId);
    const senderName = userName || member?.name || 'Khách';
    const senderAvatar = avatar || member?.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPbHo0WbRHUQwGQOjadraD_tAk7XQUGjJQPQDSvK5RZfRCVSUufHkI5ytr1RnoudWNDKzqxm86HwkNOfZhdJ6gH5wUBF8Hu6sx3uE-8dvCv61CH5Sl6_6rcVCCUeOGM4Ub3reCBWB2-ittRPKQslAi-yOnv0WlNzjOskqtQAYGefgmgohy9WNwv1lISujIp8aIK3M0rynROP6yxRZcTMSyWswRJsdzf7K4DhDzjq8';
    const isHost = member ? member.isHost : (room.hostId === userId);

    const message = {
      id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      type: 'chat',
      userId,
      userName: senderName,
      avatar: senderAvatar,
      isHost,
      content: content.trim(),
      time: this.formatTime()
    };

    room.messages.push(message);
    if (room.messages.length > 100) room.messages.shift();
    room.lastActive = Date.now();

    this.broadcast(room.code, {
      type: 'chat_message',
      message
    });

    return message;
  }

  /**
   * Broadcast floating emoji reaction on the video screen
   */
  sendReaction(code, userId, { emoji, userName }) {
    const room = this.getRoom(code);
    if (!room) throw new Error('Phòng xem không tồn tại');

    const member = room.members.find(m => m.id === userId);
    const senderName = userName || member?.name || 'Bạn';

    const reactionPayload = {
      type: 'reaction',
      emoji: emoji || '❤️',
      userName: senderName,
      userId,
      id: `react_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`
    };

    room.lastActive = Date.now();
    this.broadcast(room.code, reactionPayload);
    return reactionPayload;
  }

  /**
   * Register a client's Server-Sent Events (SSE) stream
   */
  registerStream(code, userId, res, req) {
    const room = this.getRoom(code);
    if (!room) {
      res.status(404).json({ status: false, message: 'Phòng không tồn tại' });
      return;
    }

    // Configure SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // Add stream to user set
    if (!room.streams.has(userId)) {
      room.streams.set(userId, new Set());
    }
    room.streams.get(userId).add(res);

    // Send initial connection snapshot
    const initEvent = {
      type: 'init',
      room: this.getSafeRoom(room)
    };
    res.write(`data: ${JSON.stringify(initEvent)}\n\n`);

    // Keep-alive heartbeat every 20 seconds
    const heartbeatTimer = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch (err) {
        clearInterval(heartbeatTimer);
      }
    }, 20000);

    // Handle connection close
    const cleanup = () => {
      clearInterval(heartbeatTimer);
      const userStreams = room.streams.get(userId);
      if (userStreams) {
        userStreams.delete(res);
        if (userStreams.size === 0) {
          room.streams.delete(userId);
        }
      }
    };

    req.on('close', cleanup);
    res.on('finish', cleanup);
    res.on('error', cleanup);
  }

  /**
   * Broadcast an event to all connected SSE clients in the room
   */
  broadcast(code, data) {
    const room = this.getRoom(code);
    if (!room) return;

    const payload = `data: ${JSON.stringify(data)}\n\n`;

    room.streams.forEach((streams, userId) => {
      streams.forEach((res) => {
        try {
          res.write(payload);
        } catch (err) {
          console.warn(`[WatchParty] Error writing to stream for user ${userId}:`, err.message);
          streams.delete(res);
        }
      });
    });
  }

  /**
   * Clean up rooms that have had zero active members or streams for over 6 hours
   */
  cleanupIdleRooms() {
    const now = Date.now();
    const SIX_HOURS = 6 * 60 * 60 * 1000;

    for (const [code, room] of this.rooms.entries()) {
      const isExpired = (now - room.lastActive) > SIX_HOURS;
      const hasStreams = room.streams.size > 0;
      if (isExpired && !hasStreams) {
        console.log(`[WatchParty] Cleaning up expired idle room: ${code}`);
        this.rooms.delete(code);
      }
    }
  }
}

module.exports = new PartyService();
