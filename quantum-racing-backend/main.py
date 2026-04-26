"""
QUANTUM RACING BACKEND v5.0
Real Quantum Mechanics with Entanglement & Educational Features
DR. XU GROUP | TEXAS A&M PHYSICS

QUANTUM MECHANICS IMPLEMENTATION:
- State vector: |ψ⟩ = α|00⟩ + β|01⟩ + γ|10⟩ + δ|11⟩
- First qubit = Universe A lane, Second qubit = Universe B lane
- |0⟩ = left lane, |1⟩ = right lane
GATES:
- H⊗I then CNOT: Creates real entangled Bell state |Φ+⟩
- S (Phase gate on qubit A): Rotates phase by π/2
- Pauli-X on qubit A: Switches Universe A car lane (A/D keys)
- Pauli-X on qubit B: Switches Universe B car lane (arrow keys)

EDUCATIONAL FEATURES:
- Concurrence: real entanglement measure sent to frontend
- Decoherence: superposition decays over time (~5 seconds)
- Quantum tunneling: small chance to survive a crash
- Dirac notation: human-readable state sent each frame
- Gate log: history of applied gates
- Measurement stats: cumulative Born rule verification
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import numpy as np
import json
import random
from datetime import datetime

app = FastAPI(
    title="Quantum Racing Backend",
    description="Real Quantum Mechanics Racing Simulation",
    version="5.0.0"
)

app.add_middleware(
    CORSMiddleware, 
    allow_origins=["*"], 
    allow_methods=["*"], 
    allow_headers=["*"]
)


# Speed configurations - INCREASED by 60%
SPEED_CONFIGS = {
    'slow': {'laser_speed': 0.8, 'spawn_interval': 60, 'superposition_spawn': 45, 'duration': 60},
    'normal': {'laser_speed': 1.1, 'spawn_interval': 45, 'superposition_spawn': 32, 'duration': 60},
    'fast': {'laser_speed': 1.6, 'spawn_interval': 30, 'superposition_spawn': 22, 'duration': 60},
}


class QuantumGame:
    """
    Real Quantum Racing Engine with Entanglement
    
    State vector representation:
    |ψ⟩ = state[0]|00⟩ + state[1]|01⟩ + state[2]|10⟩ + state[3]|11⟩
    
    - First qubit: Universe A lane (|0⟩ = left, |1⟩ = right)
    - Second qubit: Universe B lane (|0⟩ = left, |1⟩ = right)
    """
    
    
    GAME_FPS = 60
    
    # Collision zone
    
    # Collision zone
    CAR_Y = 75
    COLLISION_Y_MIN = 73
    COLLISION_Y_MAX = 77
    
    # Decoherence: superposition decays over this many frames (~5 seconds)
    DECOHERENCE_FRAMES = 300
    # Quantum tunneling base probability (decreases with progress)
    TUNNEL_PROB_BASE = 0.15

    def __init__(self, speed='normal'):
        # Quantum state vector: [|00⟩, |01⟩, |10⟩, |11⟩]
        # Start in classical state |00⟩ (both in left lane, Universe B inactive)
        self.state = np.array([1.0, 0.0, 0.0, 0.0], dtype=complex)
        self.in_superposition = False
        
        # Game state
        self.lasers = []
        self.score = 0
        self.frame = 0
        self.running = True
        self.paused = False
        self.game_won = False
        
        # Statistics
        self.hadamard_uses = 0
        self.lasers_passed = 0
        self.crash_frame = None
        
        # Lane offset for visual swapping (toggles 0/1)
        self.lane_offset = 0
        
        # NEW: Educational & quantum features
        self.gate_log = []              # History of gates applied
        self.superposition_frame = 0    # Frame when superposition started
        self.phase_A = 0.0              # Current phase on qubit A
        self.tunnel_event = False        # Flag for tunneling save
        self.measurement_stats = {'00': 0, '01': 0, '10': 0, '11': 0}
        self.total_measurements = 0
        
        # Speed settings
        config = SPEED_CONFIGS.get(speed, SPEED_CONFIGS['normal'])
        self.laser_speed = config['laser_speed']
        self.classical_spawn_interval = config['spawn_interval']
        self.superposition_spawn_interval = config['superposition_spawn']
        self.total_frames = config['duration'] * self.GAME_FPS
        self.speed_mode = speed

    @property
    def laser_spawn_interval(self):
        return self.superposition_spawn_interval if self.in_superposition else self.classical_spawn_interval

    def set_speed(self, speed):
        config = SPEED_CONFIGS.get(speed, SPEED_CONFIGS['normal'])
        self.laser_speed = config['laser_speed']
        self.classical_spawn_interval = config['spawn_interval']
        self.superposition_spawn_interval = config['superposition_spawn']
        self.total_frames = config['duration'] * self.GAME_FPS
        self.speed_mode = speed

    def get_progress(self):
        return min(100, (self.frame / self.total_frames) * 100)

    def compute_concurrence(self):
        """
        Compute the concurrence of the 2-qubit state.
        C = 0 means product state, C = 1 means maximally entangled.
        Uses the formula: C = 2|αδ - βγ| for a pure 2-qubit state.
        """
        a, b, c, d = self.state
        return float(2 * abs(a * d - b * c))

    def get_coherence(self):
        """
        Returns coherence level (1.0 = fresh superposition, 0.0 = fully decohered).
        Decays linearly over DECOHERENCE_FRAMES.
        """
        if not self.in_superposition:
            return 0.0
        elapsed = self.frame - self.superposition_frame
        return max(0.0, 1.0 - elapsed / self.DECOHERENCE_FRAMES)

    def get_dirac_notation(self):
        """Return human-readable Dirac notation of the current state."""
        labels = ['|00⟩', '|01⟩', '|10⟩', '|11⟩']
        terms = []
        for amp, label in zip(self.state, labels):
            prob = abs(amp) ** 2
            if prob > 0.005:  # Skip near-zero terms
                coeff = f"{abs(amp):.2f}"
                terms.append(f"{coeff}{label}")
        return ' + '.join(terms) if terms else '|00⟩'

    def apply_hadamard_cnot(self):
        """
        Press H: Apply REAL Hadamard gate on qubit A, then CNOT(A→B).
        
        H⊗I matrix (Hadamard on first qubit, identity on second):
        1/√2 * [[1,0,1,0],[0,1,0,1],[1,0,-1,0],[0,1,0,-1]]
        
        CNOT matrix (control=A, target=B):
        [[1,0,0,0],[0,1,0,0],[0,0,0,1],[0,0,1,0]]
        
        From |00⟩ this produces the Bell state: (|00⟩ + |11⟩)/√2
        This is REAL quantum mechanics — not random amplitudes!
        """
        if self.paused:
            return
        
        # Step 1: Hadamard on qubit A (H ⊗ I)
        h = 1.0 / np.sqrt(2)
        H_I = np.array([
            [h, 0, h, 0],
            [0, h, 0, h],
            [h, 0, -h, 0],
            [0, h, 0, -h]
        ], dtype=complex)
        
        # Step 2: CNOT (control=A, target=B)
        CNOT = np.array([
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 0, 1],
            [0, 0, 1, 0]
        ], dtype=complex)
        
        # Apply H⊗I then CNOT
        self.state = CNOT @ (H_I @ self.state)
        self.in_superposition = True
        self.hadamard_uses += 1
        self.lane_offset = 0
        self.superposition_frame = self.frame
        self.phase_A = 0.0
        self.gate_log.append('H⊗I')
        self.gate_log.append('CNOT')

    def apply_phase_gate(self):
        """
        Press S: Apply S gate (phase gate) on qubit A.
        S = diag(1, 1, i, i) in the 2-qubit basis.
        This rotates phase by π/2 without changing measurement probabilities.
        The effect shows up in interference when combined with other gates.
        """
        if self.paused or not self.in_superposition:
            return
        
        S_I = np.array([
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1j, 0],
            [0, 0, 0, 1j]
        ], dtype=complex)
        self.state = S_I @ self.state
        self.phase_A = (self.phase_A + np.pi / 2) % (2 * np.pi)
        self.gate_log.append('S')

    def apply_laser_switch(self):
        """
        Move the incoming laser to the other universe in the same lane.
        Allows player to strategically position threats based on probabilities.
        """
        if self.paused or not self.in_superposition:
            return

        # Find the most threatening incoming laser (closest to car but not passed)
        incoming_lasers = [l for l in self.lasers if l['y'] < self.COLLISION_Y_MIN]
        
        if not incoming_lasers:
            return
            
        # Sort by Y (highest Y = closest to bottom/car)
        incoming_lasers.sort(key=lambda l: l['y'], reverse=True)
        target_laser = incoming_lasers[0]
        
        # Switch universe
        curr_u = target_laser['universe']
        target_laser['universe'] = 'B' if curr_u == 'A' else 'A'

    def apply_pauli_x_A(self):
        """
        Press A or D: Swap lanes
        In classical mode: directly flip the quantum state
        In superposition: toggle visual offset (probabilities stay same)
        """
        if self.paused:
            return
        
        if self.in_superposition:
            # In superposition, toggle the lane offset for visual swap
            self.lane_offset = 1 - self.lane_offset
        else:
            # In classical mode, flip the actual quantum state (no offset change)
            pauli_x_I = np.array([
                [0, 0, 1, 0],
                [0, 0, 0, 1],
                [1, 0, 0, 0],
                [0, 1, 0, 0]
            ], dtype=complex)
            self.state = pauli_x_I @ self.state

    def apply_pauli_x_B(self):
        """
        Press ←/→: Swap lanes
        In classical mode: directly flip the quantum state
        In superposition: toggle visual offset (probabilities stay same)
        """
        if self.paused:
            return
        
        if self.in_superposition:
            # In superposition, toggle the lane offset for visual swap
            self.lane_offset = 1 - self.lane_offset
        else:
            # In classical mode, flip the actual quantum state (no offset change)
            I_pauli_x = np.array([
                [0, 1, 0, 0],
                [1, 0, 0, 0],
                [0, 0, 0, 1],
                [0, 0, 1, 0]
            ], dtype=complex)
            self.state = I_pauli_x @ self.state

    def toggle_pause(self):
        self.paused = not self.paused
        return self.paused

    def get_probabilities(self):
        """Get probability of each basis state using Born rule"""
        probs = np.abs(self.state) ** 2
        return {
            '00': float(probs[0]),  # A:left, B:left
            '01': float(probs[1]),  # A:left, B:right
            '10': float(probs[2]),  # A:right, B:left
            '11': float(probs[3])   # A:right, B:right
        }

    def get_lane_probabilities(self):
        """
        Get marginal probabilities for each universe's lane
        P(A=left) = P(|00⟩) + P(|01⟩)
        P(A=right) = P(|10⟩) + P(|11⟩)
        P(B=left) = P(|00⟩) + P(|10⟩)
        P(B=right) = P(|01⟩) + P(|11⟩)
        """
        probs = np.abs(self.state) ** 2
        return {
            'A': {'left': float(probs[0] + probs[1]), 'right': float(probs[2] + probs[3])},
            'B': {'left': float(probs[0] + probs[2]), 'right': float(probs[1] + probs[3])}
        }

    def update(self):
        if self.paused or not self.running:
            return
        
        self.frame += 1
        self.tunnel_event = False  # Reset each frame
        
        # Win condition
        if self.frame >= self.total_frames:
            self.game_won = True
            self.running = False
            return
        
        # Decoherence: gradually collapse superposition over time
        if self.in_superposition:
            coherence = self.get_coherence()
            if coherence <= 0:
                # Fully decohered — collapse to most probable state
                probs = np.abs(self.state) ** 2
                outcome = np.random.choice(4, p=probs)
                self.state = np.zeros(4, dtype=complex)
                self.state[outcome] = 1.0
                self.in_superposition = False
                self.lane_offset = 0
                self.gate_log.append('DECOHERE')
                labels = ['00', '01', '10', '11']
                self.measurement_stats[labels[outcome]] += 1
                self.total_measurements += 1
        
        # Spawn lasers - but only ONE at a time near the player!
        if self.frame % self.laser_spawn_interval == 0:
            # Check if there's ANY laser still in the danger zone (top 75% of screen)
            # If so, don't spawn a new laser yet
            any_laser_nearby = any(l['y'] < 70 for l in self.lasers)
            
            if not any_laser_nearby:
                if self.in_superposition:
                    # In superposition: lasers can appear in BOTH universes
                    universe = random.choice(['A', 'B'])
                else:
                    # Classical: only Universe A
                    universe = 'A'
                
                # Random speed variation (0.7x to 1.5x base speed)
                speed_multiplier = 0.7 + random.random() * 0.8
                
                # Random lane selection
                spawn_lane = random.choice([0, 1])
                
                self.lasers.append({
                    'universe': universe,
                    'lane': spawn_lane,
                    'y': -5,
                    'id': f"laser_{self.frame}",
                    'speed': self.laser_speed * speed_multiplier
                })
        
        # Update lasers and check collisions
        for laser in self.lasers[:]:
            # Each laser has its own speed
            laser['y'] += laser.get('speed', self.laser_speed)
            
            # Collision check (measurement!)
            if self.COLLISION_Y_MIN <= laser['y'] <= self.COLLISION_Y_MAX:
                result = self.measure_collision(laser)
                if result == 'crash':
                    self.crash_frame = self.frame
                    self.running = False
                    return
                elif result == 'pass':
                    self.lasers_passed += 1
                    if laser in self.lasers:
                        self.lasers.remove(laser)
                    # COLLAPSE after passing in superposition!
                    if self.in_superposition:
                        self._collapse_after_pass(laser)
            
            # Remove off-screen lasers
            elif laser['y'] > 100:
                if laser in self.lasers:
                    self.lasers.remove(laser)
        
        if self.running:
            self.score += 1

    def measure_collision(self, laser):
        """
        QUANTUM MEASUREMENT using TRUE Born Rule!
        
        Survival probability = probability of being in the SAFE lane
        Based on the actual quantum state probabilities.
        
        Player must read probabilities and choose wisely!
        
        Returns: 'crash' or 'pass'
        """
        probs = np.abs(self.state) ** 2
        universe = laser['universe']
        laser_lane = laser['lane']
        
        # Classical mode: deterministic collision
        if not self.in_superposition:
            if probs[0] > 0.5 or probs[1] > 0.5:
                base_lane = 0
            else:
                base_lane = 1
            car_lane = (base_lane + self.lane_offset) % 2
            return 'crash' if car_lane == laser_lane else 'pass'
        
        # QUANTUM MODE: Use TRUE Born rule with actual probabilities!
        # Calculate probability of survival based on quantum state
        
        # Apply lane_offset to determine effective laser lane in quantum basis
        effective_laser_lane = (laser_lane + self.lane_offset) % 2
        
        if universe == 'A':
            # Probability car A is in SAFE lane (NOT the laser lane)
            if effective_laser_lane == 0:  # Laser in left lane
                # Safe if A is in right lane: |10⟩ or |11⟩
                prob_safe = probs[2] + probs[3]
            else:  # Laser in right lane
                # Safe if A is in left lane: |00⟩ or |01⟩
                prob_safe = probs[0] + probs[1]
        else:  # Universe B
            if effective_laser_lane == 0:  # Laser in left lane
                # Safe if B is in right lane: |01⟩ or |11⟩
                prob_safe = probs[1] + probs[3]
            else:  # Laser in right lane
                # Safe if B is in left lane: |00⟩ or |10⟩
                prob_safe = probs[0] + probs[2]
        
        # Born rule: survive with probability = prob_safe
        # Record measurement outcome for statistics
        self.total_measurements += 1
        
        if random.random() < prob_safe:
            return 'pass'
        else:
            # Quantum tunneling: small chance to survive even when "crashed"
            # Probability decreases as game progresses (harder over time)
            progress_factor = 1.0 - self.get_progress() / 100.0
            tunnel_prob = self.TUNNEL_PROB_BASE * progress_factor
            if self.in_superposition and random.random() < tunnel_prob:
                self.tunnel_event = True
                return 'pass'
            return 'crash'

    def _collapse_to_safe(self, universe, laser_lane):
        """
        Collapse wavefunction to safe states (renormalize)
        After passing through laser, we're definitely NOT in the hit lane
        """
        probs = np.abs(self.state) ** 2
        
        if universe == 'A':
            if laser_lane == 0:
                # A was measured NOT in left lane → collapse to |10⟩ or |11⟩
                safe_probs = probs[2] + probs[3]
                if safe_probs > 0:
                    self.state = np.array([0, 0, self.state[2], self.state[3]], dtype=complex)
                    self.state = self.state / np.linalg.norm(self.state)
            else:
                # A was measured NOT in right lane → collapse to |00⟩ or |01⟩
                safe_probs = probs[0] + probs[1]
                if safe_probs > 0:
                    self.state = np.array([self.state[0], self.state[1], 0, 0], dtype=complex)
                    self.state = self.state / np.linalg.norm(self.state)
        else:
            if laser_lane == 0:
                # B was measured NOT in left lane → collapse to |01⟩ or |11⟩
                safe_probs = probs[1] + probs[3]
                if safe_probs > 0:
                    self.state = np.array([0, self.state[1], 0, self.state[3]], dtype=complex)
                    self.state = self.state / np.linalg.norm(self.state)
            else:
                # B was measured NOT in right lane → collapse to |00⟩ or |10⟩
                safe_probs = probs[0] + probs[2]
                if safe_probs > 0:
                    self.state = np.array([self.state[0], 0, self.state[2], 0], dtype=complex)
                    self.state = self.state / np.linalg.norm(self.state)
        
        # Check if we're back to classical (only Universe A)
        self._check_superposition()

    def _check_superposition(self):
        """Check if we're still in superposition or collapsed to classical"""
        probs = np.abs(self.state) ** 2
        # If we're in a pure |x0⟩ or |x1⟩ state (B qubit is definite), 
        # we could consider it classical, but let's keep superposition active
        # until explicitly collapsed
        total_prob = sum(probs)
        if total_prob < 0.01:
            # Edge case: reset to classical
            self.state = np.array([1.0, 0, 0, 0], dtype=complex)
            self.in_superposition = False

    def _collapse_after_pass(self, laser):
        """
        Collapse back to classical mode after passing through a laser.
        The wavefunction measurement causes collapse - can use H again!
        """
        universe = laser['universe']
        laser_lane = laser['lane']
        probs = np.abs(self.state) ** 2
        
        # Determine which lane the car ended up in based on survival
        # If laser was in lane X and we passed, we're in the OTHER lane
        safe_lane = 1 - laser_lane
        
        # Collapse to classical state - ensure BOTH cars are in the safe lane
        # This prevents confusion where one car is safe and the other appears in the danger lane
        if safe_lane == 0:  # Car in left lane
            self.state = np.array([1.0, 0, 0, 0], dtype=complex)  # |00⟩ A:Left, B:Left
        else:  # Car in right lane
            self.state = np.array([0, 0, 0, 1.0], dtype=complex)  # |11⟩ A:Right, B:Right
        
        self.in_superposition = False
        self.lane_offset = 0  # Reset offset

    def get_state(self):
        lane_probs = self.get_lane_probabilities()
        probs = np.abs(self.state) ** 2
        
        # In classical, car is in definite lane
        # In superposition, show car position based on highest probability
        if not self.in_superposition:
            base_lane_A = 0 if lane_probs['A']['left'] > 0.5 else 1
            base_lane_B = base_lane_A
        else:
            # Show most likely position for each car
            base_lane_A = 0 if lane_probs['A']['left'] > lane_probs['A']['right'] else 1
            base_lane_B = 0 if lane_probs['B']['left'] > lane_probs['B']['right'] else 1
        
        # Apply lane offset (flips lanes when swap is pressed)
        visual_lane_A = (base_lane_A + self.lane_offset) % 2
        visual_lane_B = (base_lane_B + self.lane_offset) % 2
        
        # Calculate effective probabilities (with offset applied)
        if self.lane_offset == 0:
            eff_A_left = lane_probs['A']['left']
            eff_A_right = lane_probs['A']['right']
            eff_B_left = lane_probs['B']['left']
            eff_B_right = lane_probs['B']['right']
        else:
            # Offset flips visual lanes
            eff_A_left = lane_probs['A']['right']
            eff_A_right = lane_probs['A']['left']
            eff_B_left = lane_probs['B']['right']
            eff_B_right = lane_probs['B']['left']
        
        return {
            "in_superposition": self.in_superposition,
            "state_vector": [
                {"real": float(c.real), "imag": float(c.imag)} 
                for c in self.state
            ],
            "probabilities": self.get_probabilities(),
            "lane_probabilities": lane_probs,
            # 4 probability percentages for display
            "prob_A_left": round(eff_A_left * 100, 1),
            "prob_A_right": round(eff_A_right * 100, 1),
            "prob_B_left": round(eff_B_left * 100, 1),
            "prob_B_right": round(eff_B_right * 100, 1),
            "car_A": {
                "lane": visual_lane_A,
                "left_prob": eff_A_left,
                "right_prob": eff_A_right
            },
            "car_B": {
                "lane": visual_lane_B,
                "left_prob": eff_B_left,
                "right_prob": eff_B_right
            },
            "lasers": self.lasers,
            "score": self.score,
            "frame": self.frame,
            "progress": self.get_progress(),
            "running": self.running,
            "paused": self.paused,
            "game_won": self.game_won,
            "total_frames": self.total_frames,
            "hadamard_uses": self.hadamard_uses,
            "lasers_passed": self.lasers_passed,
            "crash_frame": self.crash_frame,
            "speed_mode": self.speed_mode,
            "lane_offset": self.lane_offset,
            # NEW: Educational quantum fields
            "dirac_notation": self.get_dirac_notation(),
            "gate_log": self.gate_log[-8:],  # Last 8 gates
            "concurrence": self.compute_concurrence(),
            "coherence": self.get_coherence(),
            "tunnel_event": self.tunnel_event,
            "phase_A": round(self.phase_A, 3),
            "measurement_stats": self.measurement_stats,
            "total_measurements": self.total_measurements
        }


@app.get("/")
async def root():
    return {"message": "Quantum Racing v5.0 - Real Gates, Decoherence & Tunneling", "status": "ONLINE"}


@app.get("/health")
async def health():
    return {"status": "healthy", "version": "5.0.0"}


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    print(f"Client {client_id} connected")
    
    game = QuantumGame()
    
    try:
        loop = asyncio.get_event_loop()
        while True:
            start_time = loop.time()
            
            try:
                # Wait for input with a short timeout to prevent blocking
                # We calculate exact sleep time at the end
                data = await asyncio.wait_for(websocket.receive_json(), timeout=0.001)
                action = data.get("action")
                
                if action == "hadamard":
                    # H key - enter superposition (Hadamard + CNOT)
                    game.apply_hadamard_cnot()
                elif action == "phase_gate":
                    # S key - apply phase gate
                    game.apply_phase_gate()
                elif action == "pauli_x_A":
                    # A/D key - switch lane in Universe A
                    game.apply_pauli_x_A()
                elif action == "pauli_x_B":
                    # Arrow keys - switch lane in Universe B
                    game.apply_pauli_x_B()
                elif action == "laser_switch":
                    # Button press - switch laser universe
                    game.apply_laser_switch()
                elif action == "pause":
                    game.toggle_pause()
                elif action == "set_speed":
                    game.set_speed(data.get("speed", "normal"))
                elif action == "restart":
                    old_speed = game.speed_mode
                    game = QuantumGame(speed=old_speed)
                    
            except asyncio.TimeoutError:
                pass
            
            game.update()
            
            if game.running:
                await websocket.send_json({
                    "type": "game_state", 
                    "data": game.get_state()
                })
            else:
                msg_type = "game_won" if game.game_won else "game_over"
                await websocket.send_json({
                    "type": msg_type,
                    "data": game.get_state()
                })
            
            # Frame pacing - maintain 60 FPS
            elapsed = loop.time() - start_time
            sleep_time = max(0.0, (1/60) - elapsed)
            await asyncio.sleep(sleep_time)
            
    except WebSocketDisconnect:
        print(f"Client {client_id} - Score: {game.score}, H uses: {game.hadamard_uses}")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)