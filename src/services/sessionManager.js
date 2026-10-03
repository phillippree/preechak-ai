/**
 * Session Manager
 * Single entrypoint and lifecycle coordinator for active assistant sessions.
 */

const { defaultOrchestrator } = require('./profileOrchestrator');

class SessionManager {
    constructor(orchestrator = defaultOrchestrator) {
        this.orchestrator = orchestrator;
        this.state = 'idle'; // 'idle' | 'starting' | 'active' | 'stopped'
        this.activePipeline = null;
        this.activeSessionId = null;
        this.startTime = null;
        this._listeners = new Set();
    }

    getState() {
        return this.state;
    }

    isActive() {
        return this.state === 'active';
    }

    async start(options = {}) {
        if (this.state === 'active' || this.state === 'starting') {
            console.warn('Session is already starting or active');
            return this.activePipeline;
        }

        this._transitionState('starting');

        const profileId = options.profile || this.orchestrator.getActiveProfileId();
        this.activePipeline = this.orchestrator.resolvePipeline(profileId, options);
        this.activeSessionId = options.sessionId || `session_${Date.now()}`;
        this.startTime = Date.now();

        this._transitionState('active', {
            sessionId: this.activeSessionId,
            pipeline: this.activePipeline,
            startTime: this.startTime,
        });

        return this.activePipeline;
    }

    async stop() {
        if (this.state === 'idle') return;

        this._transitionState('stopped', {
            sessionId: this.activeSessionId,
            duration: this.startTime ? Date.now() - this.startTime : 0,
        });

        this.state = 'idle';
        this.activePipeline = null;
        this.activeSessionId = null;
        this.startTime = null;

        this._emit('reset');
    }

    switchProfile(profileId, overrides = {}) {
        const pipeline = this.orchestrator.setProfile(profileId, overrides);
        if (this.isActive()) {
            this.activePipeline = pipeline;
            this._emit('reconfigured', { pipeline });
        }
        return pipeline;
    }

    onEvent(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    _transitionState(newState, data = {}) {
        const oldState = this.state;
        this.state = newState;
        this._emit('stateChange', {
            previousState: oldState,
            currentState: newState,
            ...data,
        });
    }

    _emit(type, payload = {}) {
        for (const listener of this._listeners) {
            try {
                listener({ type, timestamp: Date.now(), ...payload });
            } catch (err) {
                console.error('Error in SessionManager listener:', err);
            }
        }
    }
}

const defaultSessionManager = new SessionManager();

module.exports = {
    SessionManager,
    defaultSessionManager,
};
