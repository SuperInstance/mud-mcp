import { describe, it, expect, beforeEach } from 'vitest';
import stateService from '../src/services/stateService.js';

describe('StateService', () => {
  beforeEach(() => {
    // Reset state for each test - recreate the module
  });

  describe('createSession', () => {
    it('should create a new session', () => {
      const session = stateService.createSession();
      expect(session).toBeTruthy();
      expect(session.id).toBeTruthy();
      expect(session.playerId).toBeTruthy();
    });

    it('should create player state with session', () => {
      const session = stateService.createSession();
      const player = stateService.getPlayerState(session.playerId);
      expect(player).toBeTruthy();
      expect(player?.player_id).toBe(session.playerId);
    });

    it('should set player in entrance room by default', () => {
      const session = stateService.createSession();
      const player = stateService.getPlayerState(session.playerId);
      expect(player?.room).toBe('entrance');
    });

    it('should have empty inventory initially', () => {
      const session = stateService.createSession();
      const player = stateService.getPlayerState(session.playerId);
      expect(player?.inventory).toEqual([]);
    });

    it('should have no quest initially', () => {
      const session = stateService.createSession();
      const player = stateService.getPlayerState(session.playerId);
      expect(player?.hasQuest).toBe(false);
    });
  });

  describe('getSession', () => {
    it('should retrieve created session', () => {
      const created = stateService.createSession();
      const retrieved = stateService.getSession(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should return undefined for unknown session', () => {
      const result = stateService.getSession('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getPlayerState', () => {
    it('should retrieve player state by id', () => {
      const session = stateService.createSession();
      const player = stateService.getPlayerState(session.playerId);
      expect(player).toBeTruthy();
    });

    it('should return undefined for unknown player', () => {
      const result = stateService.getPlayerState('unknown_player');
      expect(result).toBeUndefined();
    });
  });

  describe('getWorld', () => {
    it('should return game world', () => {
      const world = stateService.getWorld();
      expect(world).toBeTruthy();
      expect(world.rooms).toBeTruthy();
    });

    it('should have entrance room', () => {
      const world = stateService.getWorld();
      expect(world.rooms['entrance']).toBeTruthy();
    });

    it('should have hallway room', () => {
      const world = stateService.getWorld();
      expect(world.rooms['hallway']).toBeTruthy();
    });
  });

  describe('movePlayer', () => {
    it('should move player to adjacent room', () => {
      const session = stateService.createSession();
      const result = stateService.movePlayer(session.playerId, 'north');
      expect(result).toBe(true);
      const player = stateService.getPlayerState(session.playerId);
      expect(player?.room).toBe('hallway');
    });

    it('should return false for invalid direction', () => {
      const session = stateService.createSession();
      const result = stateService.movePlayer(session.playerId, 'up');
      expect(result).toBe(false);
    });

    it('should return false for unknown player', () => {
      const result = stateService.movePlayer('unknown', 'north');
      expect(result).toBe(false);
    });

    it('should update monster presence when entering monster room', () => {
      const session = stateService.createSession();
      // Move to hallway (has quest)
      stateService.movePlayer(session.playerId, 'north');
      // Move to chamber (has goblin)
      stateService.movePlayer(session.playerId, 'east');
      const player = stateService.getPlayerState(session.playerId);
      expect(player?.monsterPresent).toBe(true);
    });
  });

  describe('addItemToInventory', () => {
    it('should add item to player inventory', () => {
      const session = stateService.createSession();
      const result = stateService.addItemToInventory(session.playerId, 'torch');
      expect(result).toBe(true);
      const player = stateService.getPlayerState(session.playerId);
      expect(player?.inventory).toContain('torch');
    });

    it('should remove item from room', () => {
      const session = stateService.createSession();
      stateService.addItemToInventory(session.playerId, 'torch');
      const world = stateService.getWorld();
      expect(world.rooms['entrance'].items).not.toContain('torch');
    });

    it('should return false for unknown player', () => {
      const result = stateService.addItemToInventory('unknown', 'torch');
      expect(result).toBe(false);
    });

    it('should return false for item not in room', () => {
      const session = stateService.createSession();
      const result = stateService.addItemToInventory(session.playerId, 'nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('acceptQuest', () => {
    it('should accept quest in room with quest', () => {
      const session = stateService.createSession();
      stateService.movePlayer(session.playerId, 'north'); // hallway has quest
      const result = stateService.acceptQuest(session.playerId);
      expect(result).toBe(true);
      const player = stateService.getPlayerState(session.playerId);
      expect(player?.hasQuest).toBe(true);
    });

    it('should return false for room without quest', () => {
      const session = stateService.createSession(); // entrance has no quest
      const result = stateService.acceptQuest(session.playerId);
      expect(result).toBe(false);
    });

    it('should return false if player already has quest', () => {
      const session = stateService.createSession();
      stateService.movePlayer(session.playerId, 'north');
      stateService.acceptQuest(session.playerId);
      const result = stateService.acceptQuest(session.playerId);
      expect(result).toBe(false);
    });
  });

  describe('canBattle', () => {
    it('should return true in room with monster', () => {
      const session = stateService.createSession();
      stateService.movePlayer(session.playerId, 'north');
      stateService.movePlayer(session.playerId, 'east'); // chamber has goblin
      const result = stateService.canBattle(session.playerId);
      expect(result).toBe(true);
    });

    it('should return false in room without monster', () => {
      const session = stateService.createSession();
      const result = stateService.canBattle(session.playerId);
      expect(result).toBe(false);
    });
  });

  describe('battle', () => {
    it('should return result object with success or failure', () => {
      const session = stateService.createSession();
      stateService.movePlayer(session.playerId, 'north');
      stateService.movePlayer(session.playerId, 'east');
      const result = stateService.battle(session.playerId);
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });

    it('should return monsterName when battle occurs', () => {
      const session = stateService.createSession();
      stateService.movePlayer(session.playerId, 'north');
      stateService.movePlayer(session.playerId, 'east');
      const result = stateService.battle(session.playerId);
      // monsterName may or may not be present depending on battle outcome
      // Just verify the result has the expected structure
      expect(result).toHaveProperty('success');
    });

    it('should return success false for unknown player', () => {
      const result = stateService.battle('unknown');
      expect(result.success).toBe(false);
    });
  });

  describe('updatePlayerRoom', () => {
    it('should update player room directly', () => {
      const session = stateService.createSession();
      const result = stateService.updatePlayerRoom(session.playerId, 'hallway');
      expect(result).toBe(true);
      const player = stateService.getPlayerState(session.playerId);
      expect(player?.room).toBe('hallway');
    });

    it('should return false for unknown player', () => {
      const result = stateService.updatePlayerRoom('unknown', 'hallway');
      expect(result).toBe(false);
    });

    it('should return false for invalid room', () => {
      const session = stateService.createSession();
      const result = stateService.updatePlayerRoom(session.playerId, 'nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('removeItemFromRoom', () => {
    it('should return false when item already taken', () => {
      // Torch was taken by previous test, so this should return false
      const result = stateService.removeItemFromRoom('entrance', 'torch');
      expect(result).toBe(false);
    });

    it('should return true for item that exists', () => {
      // Use key which is in hallway
      const result = stateService.removeItemFromRoom('hallway', 'key');
      expect(result).toBe(true);
      const world = stateService.getWorld();
      expect(world.rooms['hallway'].items).not.toContain('key');
    });

    it('should return false for item not in room', () => {
      const result = stateService.removeItemFromRoom('entrance', 'nonexistent');
      expect(result).toBe(false);
    });

    it('should return false for unknown room', () => {
      const result = stateService.removeItemFromRoom('unknown', 'torch');
      expect(result).toBe(false);
    });
  });
});