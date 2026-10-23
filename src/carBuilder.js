/**
 * APEX OVERDRIVE: BeamNG Soft-Body Physics Edition
 * High-Polygon Sculpted Vehicle Builder & Real-Time Vertex Soft-Body Deformation Engine
 */

(function (global) {
    'use strict';

    // 6 Playable Vehicle Classes with distinct mass, stiffness, aero, and visual profiles
    const CAR_SPECS = {
        HYPER: {
            id: 'HYPER',
            name: 'V12 ROSSO CORSA',
            category: 'ITALIAN V12 HYPERCAR',
            desc: '流麗なウェッジシェイプと高出力V12自然吸気エンジン。最高速・旋回性能・クラッシュ吸収ゾーンのバランスに優れたフラッグシップ。',
            color: 0xef233c,
            accent: 0x111827,
            rimColor: 0xfbbf24,
            caliperColor: 0xef4444,
            underglowColor: 0x38bdf8,
            maxSpeed: 385,
            accel: 98,
            steerPower: 30.0,
            massKg: 1420,
            stiffness: 1.0,
            armorMultiplier: 1.05,
            profile: 'WEDGE_HYPER',
            stats: { speed: 92, accel: 88, handling: 90, armor: 72, mass: 65 }
        },
        JDM: {
            id: 'JDM',
            name: 'N-GTR R35 NISMO AERO',
            category: 'JDM TWIN-TURBO AWD GT',
            desc: '国産ツインターボ＋アテーサE-TS 4WDシステム搭載。圧倒的な立ち上がり加速と鋭いレーンチェンジ、高いボディ剛性を誇るストリート仕様。',
            color: 0x0284c7,
            accent: 0x0f172a,
            rimColor: 0xf8fafc,
            caliperColor: 0xf59e0b,
            underglowColor: 0x00f5d4,
            maxSpeed: 365,
            accel: 118,
            steerPower: 34.0,
            massKg: 1710,
            stiffness: 1.18,
            armorMultiplier: 1.18,
            profile: 'COUPE_GT',
            stats: { speed: 86, accel: 95, handling: 94, armor: 82, mass: 78 }
        },
        INTERCEPTOR: {
            id: 'INTERCEPTOR',
            name: 'TITAN V8 ARMORED RAM',
            category: 'HEAVY TACTICAL INTERCEPTOR',
            desc: '鋼鉄製プッシュバンパー＆強化ロールケージ装備の重装甲インターセプター。逆走車や煽り運転車を弾き飛ばす質量と180%の車体剛性。',
            color: 0x2b3544,
            accent: 0xf59e0b,
            rimColor: 0x94a3b8,
            caliperColor: 0xef4444,
            underglowColor: 0xf59e0b,
            maxSpeed: 342,
            accel: 90,
            steerPower: 26.5,
            massKg: 2380,
            stiffness: 1.75,
            armorMultiplier: 1.80,
            profile: 'MUSCLE_ARMORED',
            stats: { speed: 78, accel: 80, handling: 76, armor: 98, mass: 96 }
        },
        PROTOTYPE: {
            id: 'PROTOTYPE',
            name: 'LE MANS X-1 LMP900',
            category: 'CARBON MONOCOQUE PROTOTYPE',
            desc: '最高速425km/hに達するル・マン耐久プロトタイプ。ティアドロップ型キャノピーと巨大シャークフィンによる異次元のダウンフォース。',
            color: 0x7c3aed,
            accent: 0x06b6d4,
            rimColor: 0x38bdf8,
            caliperColor: 0x22d3ee,
            underglowColor: 0xd946ef,
            maxSpeed: 425,
            accel: 132,
            steerPower: 37.5,
            massKg: 930,
            stiffness: 0.90,
            armorMultiplier: 0.92,
            profile: 'LMP_PROTOTYPE',
            stats: { speed: 100, accel: 100, handling: 98, armor: 60, mass: 45 }
        },
        DRIFT: {
            id: 'DRIFT',
            name: 'RX-7FD ROTARY WIDEBODY',
            category: 'STREET DRIFT SPECIAL',
            desc: 'ワイドフェンダー＆GTウイングを備えたロータリードリフトマシン。スリップアングルを維持した高速ドリフト追い越しでコンボ倍率が跳ね上がる！',
            color: 0xfacc15,
            accent: 0x090d16,
            rimColor: 0x1e293b,
            caliperColor: 0x22c55e,
            underglowColor: 0xf43f5e,
            maxSpeed: 358,
            accel: 112,
            steerPower: 36.5,
            massKg: 1260,
            stiffness: 1.02,
            armorMultiplier: 1.05,
            profile: 'WIDEBODY_DRIFT',
            stats: { speed: 84, accel: 92, handling: 99, armor: 70, mass: 58 }
        },
        GOLIATH: {
            id: 'GOLIATH',
            name: 'GOLIATH V10 WRECKER',
            category: 'HEAVY ASSAULT HYPER-SUV',
            desc: '3.1トンの超重量級ハイパーSUV。大径オフロードタイヤと強化サスペンションを備え、スパイク帯や障害物への耐性が極めて高い破壊王。',
            color: 0x10b981,
            accent: 0x18181b,
            rimColor: 0xe2e8f0,
            caliperColor: 0xf97316,
            underglowColor: 0x10b981,
            maxSpeed: 332,
            accel: 88,
            steerPower: 25.0,
            massKg: 3100,
            stiffness: 2.10,
            armorMultiplier: 2.15,
            profile: 'HEAVY_SUV',
            stats: { speed: 75, accel: 79, handling: 74, armor: 100, mass: 100 }
        }
    };

    /**
     * Prepare a BufferGeometry for real-time BeamNG-style soft-body vertex deformation.
     * Stores original rest positions and adds a vertex color buffer so crumpled metal darkens/scratches.
     */
    function makeGeometryDeformable(geo, stiffnessWeight = 1.0) {
        // Ensure non-indexed or clean vertex access so creases and sharp folds look crisp
        const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
        const posAttr = nonIndexed.attributes.position;
        const count = posAttr.count;

        const origPositions = new Float32Array(posAttr.array.length);
        origPositions.set(posAttr.array);

        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count * 3; i++) {
            colors[i] = 1.0;
        }
        nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        nonIndexed.computeVertexNormals();

        nonIndexed.userData = {
            origPositions,
            stiffnessWeight,
            maxDeformation: 0,
            totalStrain: 0
        };
        return nonIndexed;
    }

    /**
     * Generates a contoured 3D automotive panel or body shell by shaping a high-density subdivided grid
     * with a custom shaping function fn(u, v, posVec3) where u, v in [-1, 1].
     */
    function createSculptedPanelGeometry(width, height, length, segX, segY, segZ, shapeFn, stiffness = 1.0) {
        const geo = new THREE.BoxGeometry(width, height, length, segX, segY, segZ);
        const pos = geo.attributes.position;
        const v = new THREE.Vector3();

        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            const nx = width > 0 ? (v.x / (width * 0.5)) : 0;
            const ny = height > 0 ? (v.y / (height * 0.5)) : 0;
            const nz = length > 0 ? (v.z / (length * 0.5)) : 0;
            shapeFn(nx, ny, nz, v);
            pos.setXYZ(i, v.x, v.y, v.z);
        }

        return makeGeometryDeformable(geo, stiffness);
    }

    /**
     * Deforms a single mesh in-place around a local or world impact point using BeamNG-like plastic crumpling,
     * metal buckling waves, and paint scuffing vertex coloration.
     */
    function deformMeshAtPoint(mesh, worldImpactPoint, worldForceVec, radius = 1.45) {
        if (!mesh || !mesh.geometry || !mesh.geometry.userData || !mesh.geometry.userData.origPositions) return 0;

        const geo = mesh.geometry;
        const posAttr = geo.attributes.position;
        const colAttr = geo.attributes.color;
        const orig = geo.userData.origPositions;
        const stiffness = geo.userData.stiffnessWeight || 1.0;

        // Transform world impact point and force direction into mesh's local space
        mesh.updateMatrixWorld();
        const invMat = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
        const localImpact = worldImpactPoint.clone().applyMatrix4(invMat);

        const normalMat = new THREE.Matrix3().getNormalMatrix(invMat);
        const localForce = worldForceVec.clone().applyMatrix3(normalMat);

        let modified = false;
        let peakDisp = 0;
        const v = new THREE.Vector3();

        for (let i = 0; i < posAttr.count; i++) {
            v.fromBufferAttribute(posAttr, i);
            const dx = v.x - localImpact.x;
            const dy = v.y - localImpact.y;
            const dz = v.z - localImpact.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < radius) {
                const falloff = Math.pow(1.0 - dist / radius, 1.55) / stiffness;
                // Deterministic high-frequency metal crease/buckling ripple based on vertex index & position
                const creaseWave = Math.sin(orig[i * 3] * 11.0 + orig[i * 3 + 2] * 9.0) * 0.065 * falloff;
                const upwardBuckle = Math.abs(localForce.z) * 0.22 * falloff * (orig[i * 3 + 1] >= 0 ? 1 : 0.2);

                let nx = v.x + localForce.x * falloff + creaseWave;
                let ny = v.y + localForce.y * falloff + upwardBuckle + Math.abs(creaseWave) * 0.4;
                let nz = v.z + localForce.z * falloff + creaseWave * 0.5;

                // Clamp maximum plastic displacement per vertex relative to its original rest position
                // so vertices never invert or explode to infinity even after 20+ crashes!
                const ox = orig[i * 3];
                const oy = orig[i * 3 + 1];
                const oz = orig[i * 3 + 2];
                const maxPlastic = 0.68;

                nx = ox + THREE.MathUtils.clamp(nx - ox, -maxPlastic, maxPlastic);
                ny = oy + THREE.MathUtils.clamp(ny - oy, -maxPlastic * 0.6, maxPlastic * 0.85);
                nz = oz + THREE.MathUtils.clamp(nz - oz, -maxPlastic, maxPlastic);

                posAttr.setXYZ(i, nx, ny, nz);

                const totalDisp = Math.sqrt((nx - ox) ** 2 + (ny - oy) ** 2 + (nz - oz) ** 2);
                if (totalDisp > peakDisp) peakDisp = totalDisp;

                // Darken / scuff paint color at deformed vertices (simulating bare metal / scraped paint)
                if (colAttr) {
                    const scuff = Math.max(0.28, 1.0 - totalDisp * 1.35);
                    colAttr.setXYZ(i, scuff, scuff, Math.min(1.0, scuff * 1.05));
                }
                modified = true;
            }
        }

        if (modified) {
            posAttr.needsUpdate = true;
            if (colAttr) colAttr.needsUpdate = true;
            geo.computeVertexNormals();
            geo.userData.maxDeformation = Math.max(geo.userData.maxDeformation, peakDisp);
            geo.userData.totalStrain += peakDisp;
        }
        return peakDisp;
    }

    /**
     * Resets a deformable mesh smoothly back to its factory rest geometry (BeamNG 'R' key Reset/Repair!)
     */
    function resetDeformableMesh(mesh) {
        if (!mesh || !mesh.geometry || !mesh.geometry.userData || !mesh.geometry.userData.origPositions) return;
        const geo = mesh.geometry;
        const posAttr = geo.attributes.position;
        const colAttr = geo.attributes.color;
        posAttr.array.set(geo.userData.origPositions);
        posAttr.needsUpdate = true;

        if (colAttr) {
            for (let i = 0; i < colAttr.count * 3; i++) {
                colAttr.array[i] = 1.0;
            }
            colAttr.needsUpdate = true;
        }
        geo.computeVertexNormals();
        geo.userData.maxDeformation = 0;
        geo.userData.totalStrain = 0;
    }

    /**
     * Builds the BeamNG.drive-style 3D Node-Beam Structural Skeleton Overlay (`beamSkeletonGroup`)
     * that visualizes real-time chassis & crumple-zone stress in 3D!
     */
    function createNodeBeamSkeleton(profile) {
        const group = new THREE.Group();
        group.visible = false; // Toggled by user with 'V' or UI button

        const isTall = profile === 'HEAVY_SUV' || profile === 'MUSCLE_ARMORED';
        const roofY = isTall ? 1.32 : 1.08;
        const beltY = isTall ? 0.78 : 0.66;
        const floorY = 0.28;

        // 28 Structural Nodes (Front Bumper -> Crumple Zone -> Firewall -> Cabin Cage -> Rear Subframe -> Rear Bumper)
        const nodes = [
            // 0-3: Front bumper beam
            new THREE.Vector3(-0.88, floorY + 0.08, -2.18),
            new THREE.Vector3( 0.88, floorY + 0.08, -2.18),
            new THREE.Vector3(-0.84, beltY - 0.12, -2.12),
            new THREE.Vector3( 0.84, beltY - 0.12, -2.12),
            // 4-7: Front suspension towers / crumple zone mid
            new THREE.Vector3(-0.92, floorY, -1.38),
            new THREE.Vector3( 0.92, floorY, -1.38),
            new THREE.Vector3(-0.88, beltY, -1.35),
            new THREE.Vector3( 0.88, beltY, -1.35),
            // 8-11: Firewall / A-pillar base
            new THREE.Vector3(-0.95, floorY, -0.68),
            new THREE.Vector3( 0.95, floorY, -0.68),
            new THREE.Vector3(-0.86, beltY + 0.06, -0.65),
            new THREE.Vector3( 0.86, beltY + 0.06, -0.65),
            // 12-15: Roof header & B-pillar top
            new THREE.Vector3(-0.66, roofY, -0.18),
            new THREE.Vector3( 0.66, roofY, -0.18),
            new THREE.Vector3(-0.68, roofY,  0.65),
            new THREE.Vector3( 0.68, roofY,  0.65),
            // 16-19: B-pillar / Rear bulkhead
            new THREE.Vector3(-0.95, floorY,  0.68),
            new THREE.Vector3( 0.95, floorY,  0.68),
            new THREE.Vector3(-0.88, beltY + 0.05,  0.68),
            new THREE.Vector3( 0.88, beltY + 0.05,  0.68),
            // 20-23: Rear suspension / trunk bay
            new THREE.Vector3(-0.92, floorY,  1.42),
            new THREE.Vector3( 0.92, floorY,  1.42),
            new THREE.Vector3(-0.86, beltY,  1.42),
            new THREE.Vector3( 0.86, beltY,  1.42),
            // 24-27: Rear bumper beam
            new THREE.Vector3(-0.86, floorY + 0.08,  2.12),
            new THREE.Vector3( 0.86, floorY + 0.08,  2.12),
            new THREE.Vector3(-0.82, beltY - 0.06,  2.08),
            new THREE.Vector3( 0.82, beltY - 0.06,  2.08)
        ];

        // Beam index pairs (longitudinal rails, crossmembers, vertical pillars, diagonal X-braces)
        const pairs = [
            // Front bumper box
            [0,1],[2,3],[0,2],[1,3],[0,3],[1,2],
            // Front crumple rails & diagonals
            [0,4],[1,5],[2,6],[3,7],[0,6],[1,7],[2,4],[3,5],
            [4,5],[6,7],[4,6],[5,7],[4,7],[5,6],
            // Engine bay to firewall
            [4,8],[5,9],[6,10],[7,11],[4,10],[5,11],[6,8],[7,9],
            [8,9],[10,11],[8,10],[9,11],
            // Cabin safety cage & A/B/C pillars
            [10,12],[11,13],[12,13],[12,14],[13,15],[14,15],[12,15],[13,14],
            [8,16],[9,17],[10,18],[11,19],[8,18],[9,19],[10,16],[11,17],
            [16,17],[18,19],[16,18],[17,19],[18,14],[19,15],
            // Rear subframe & C-pillars
            [14,22],[15,23],[16,20],[17,21],[18,22],[19,23],[16,22],[17,23],
            [20,21],[22,23],[20,22],[21,23],[20,23],[21,22],
            // Rear crumple zone
            [20,24],[21,25],[22,26],[23,27],[20,26],[21,27],
            [24,25],[26,27],[24,26],[25,27],[24,27],[25,26]
        ];

        const origNodes = nodes.map(n => n.clone());
        const positions = new Float32Array(pairs.length * 2 * 3);
        const colors = new Float32Array(pairs.length * 2 * 3);

        for (let i = 0; i < pairs.length; i++) {
            const [a, b] = pairs[i];
            const na = nodes[a];
            const nb = nodes[b];
            positions[i * 6 + 0] = na.x;
            positions[i * 6 + 1] = na.y;
            positions[i * 6 + 2] = na.z;
            positions[i * 6 + 3] = nb.x;
            positions[i * 6 + 4] = nb.y;
            positions[i * 6 + 5] = nb.z;

            // Default healthy BeamNG green
            colors[i * 6 + 0] = 0.15; colors[i * 6 + 1] = 0.95; colors[i * 6 + 2] = 0.35;
            colors[i * 6 + 3] = 0.15; colors[i * 6 + 4] = 0.95; colors[i * 6 + 5] = 0.35;
        }

        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        lineGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const lineMat = new THREE.LineBasicMaterial({
            vertexColors: true,
            linewidth: 2,
            depthTest: false,
            transparent: true,
            opacity: 0.92
        });

        const lineSegments = new THREE.LineSegments(lineGeo, lineMat);
        lineSegments.renderOrder = 999;
        group.add(lineSegments);

        // Node spheres
        const nodeSpheres = [];
        const sphereGeo = new THREE.SphereGeometry(0.055, 8, 8);
        nodes.forEach((n) => {
            const sp = new THREE.Mesh(
                sphereGeo,
                new THREE.MeshBasicMaterial({ color: 0x38bdf8, depthTest: false, transparent: true, opacity: 0.95 })
            );
            sp.position.copy(n);
            sp.renderOrder = 1000;
            group.add(sp);
            nodeSpheres.push(sp);
        });

        group.userData = {
            nodes,
            origNodes,
            nodeStrain: new Float32Array(nodes.length),
            pairs,
            lineSegments,
            nodeSpheres
        };

        return group;
    }

    /**
     * Updates the Node-Beam skeleton positions & stress colors when an impact occurs
     */
    function deformNodeBeamSkeleton(skeletonGroup, localImpactPoint, localForceVec, radius = 1.65) {
        if (!skeletonGroup || !skeletonGroup.userData) return;
        const { nodes, origNodes, nodeStrain, pairs, lineSegments, nodeSpheres } = skeletonGroup.userData;

        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const dist = n.distanceTo(localImpactPoint);
            if (dist < radius) {
                const falloff = Math.pow(1.0 - dist / radius, 1.5);
                n.x += localForceVec.x * falloff * 0.85;
                n.y += localForceVec.y * falloff * 0.85 + Math.abs(localForceVec.z) * 0.15 * falloff;
                n.z += localForceVec.z * falloff * 0.85;

                // Clamp relative to origNodes
                const o = origNodes[i];
                n.x = o.x + THREE.MathUtils.clamp(n.x - o.x, -0.6, 0.6);
                n.y = o.y + THREE.MathUtils.clamp(n.y - o.y, -0.45, 0.65);
                n.z = o.z + THREE.MathUtils.clamp(n.z - o.z, -0.65, 0.65);

                const disp = n.distanceTo(o);
                nodeStrain[i] = Math.min(1.0, Math.max(nodeStrain[i], disp / 0.42));
                nodeSpheres[i].position.copy(n);

                const s = nodeStrain[i];
                if (s > 0.65) nodeSpheres[i].material.color.setHex(0xef4444);
                else if (s > 0.25) nodeSpheres[i].material.color.setHex(0xf59e0b);
                else nodeSpheres[i].material.color.setHex(0x38bdf8);
            }
        }

        const posAttr = lineSegments.geometry.attributes.position;
        const colAttr = lineSegments.geometry.attributes.color;

        for (let i = 0; i < pairs.length; i++) {
            const [a, b] = pairs[i];
            const na = nodes[a];
            const nb = nodes[b];
            posAttr.setXYZ(i * 2, na.x, na.y, na.z);
            posAttr.setXYZ(i * 2 + 1, nb.x, nb.y, nb.z);

            const strain = Math.max(nodeStrain[a], nodeStrain[b]);
            // Color ramp: Green -> Yellow -> Orange -> Red
            let r = 0.15, g = 0.95, bl = 0.30;
            if (strain > 0.05) {
                r = Math.min(1.0, strain * 2.2);
                g = Math.max(0.08, 1.0 - Math.max(0, strain - 0.35) * 1.6);
                bl = 0.1;
            }
            colAttr.setXYZ(i * 2, r, g, bl);
            colAttr.setXYZ(i * 2 + 1, r, g, bl);
        }

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
    }

    function resetNodeBeamSkeleton(skeletonGroup) {
        if (!skeletonGroup || !skeletonGroup.userData) return;
        const { nodes, origNodes, nodeStrain, pairs, lineSegments, nodeSpheres } = skeletonGroup.userData;
        for (let i = 0; i < nodes.length; i++) {
            nodes[i].copy(origNodes[i]);
            nodeStrain[i] = 0;
            nodeSpheres[i].position.copy(origNodes[i]);
            nodeSpheres[i].material.color.setHex(0x38bdf8);
        }
        const posAttr = lineSegments.geometry.attributes.position;
        const colAttr = lineSegments.geometry.attributes.color;
        for (let i = 0; i < pairs.length; i++) {
            const [a, b] = pairs[i];
            posAttr.setXYZ(i * 2, nodes[a].x, nodes[a].y, nodes[a].z);
            posAttr.setXYZ(i * 2 + 1, nodes[b].x, nodes[b].y, nodes[b].z);
            colAttr.setXYZ(i * 2, 0.15, 0.95, 0.35);
            colAttr.setXYZ(i * 2 + 1, 0.15, 0.95, 0.35);
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
    }

    /**
     * Builds a detailed 3D Wheel Assembly:
     * - Radial Tire with sidewall bevels
     * - 6-Spoke 3D Alloy Rim with center lock nut
     * - Ventilated Steel Brake Rotor (glows hot orange under braking!)
     * - Brembo-style Painted Brake Caliper
     */
    function buildDetailedWheelAssembly(spec, sideSign, radius = 0.40, width = 0.34) {
        const hubGroup = new THREE.Group();
        const spinGroup = new THREE.Group();

        // 1. Sculpted Radial Tire with rounded shoulders
        const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 24, 3);
        tireGeo.rotateZ(Math.PI / 2);
        const tPos = tireGeo.attributes.position;
        for (let i = 0; i < tPos.count; i++) {
            const x = tPos.getX(i);
            const y = tPos.getY(i);
            const z = tPos.getZ(i);
            const r = Math.sqrt(y * y + z * z);
            if (r > radius * 0.85 && Math.abs(x) > width * 0.38) {
                tPos.setY(i, y * 0.94);
                tPos.setZ(i, z * 0.94);
            }
        }
        tireGeo.computeVertexNormals();
        const tireMat = new THREE.MeshStandardMaterial({
            color: 0x11151c,
            roughness: 0.78,
            metalness: 0.15
        });
        const tireMesh = new THREE.Mesh(tireGeo, tireMat);
        tireMesh.castShadow = true;
        spinGroup.add(tireMesh);

        // 2. Outer Alloy Rim Barrel & 6-Spoke Star
        const rimRadius = radius * 0.68;
        const rimMat = new THREE.MeshStandardMaterial({
            color: spec.rimColor,
            metalness: 0.92,
            roughness: 0.16
        });
        const barrelGeo = new THREE.CylinderGeometry(rimRadius, rimRadius, width * 1.02, 18, 1, true);
        barrelGeo.rotateZ(Math.PI / 2);
        const rimMesh = new THREE.Mesh(barrelGeo, rimMat);

        const spokeGroup = new THREE.Group();
        const spokeGeo = new THREE.BoxGeometry(0.05, rimRadius * 1.82, 0.055);
        for (let s = 0; s < 6; s++) {
            const sp = new THREE.Mesh(spokeGeo, rimMat);
            sp.rotation.x = (s * Math.PI) / 6;
            sp.position.x = sideSign * (width * 0.42);
            spokeGroup.add(sp);
        }
        // Center lock cap
        const capGeo = new THREE.CylinderGeometry(0.08, 0.08, width * 1.06, 12);
        capGeo.rotateZ(Math.PI / 2);
        const capMesh = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: spec.caliperColor, metalness: 0.8, roughness: 0.2 }));
        spokeGroup.add(capMesh);

        spinGroup.add(rimMesh, spokeGroup);

        // 3. Brake Rotor Disc (glows under heavy braking) & Caliper (fixed to hubGroup so caliper doesn't spin!)
        const rotorGeo = new THREE.CylinderGeometry(rimRadius * 0.78, rimRadius * 0.78, 0.06, 18);
        rotorGeo.rotateZ(Math.PI / 2);
        const rotorMat = new THREE.MeshStandardMaterial({
            color: 0x94a3b8,
            metalness: 0.88,
            roughness: 0.28,
            emissive: 0xff3300,
            emissiveIntensity: 0.0
        });
        const rotorMesh = new THREE.Mesh(rotorGeo, rotorMat);
        spinGroup.add(rotorMesh);

        const caliperMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.22, 0.14),
            new THREE.MeshStandardMaterial({ color: spec.caliperColor || 0xef4444, metalness: 0.6, roughness: 0.3 })
        );
        caliperMesh.position.set(sideSign * 0.08, 0.06, -rimRadius * 0.52);
        hubGroup.add(caliperMesh);

        hubGroup.add(spinGroup);
        return { hubGroup, spinGroup, tireMesh, rimMesh, rotorMat };
    }

    /**
     * Builds the complete High-Polygon Sculpted Player Vehicle with:
     * - Sculpted aerodynamic monocoque & wheel arches
     * - 10 independently deformable soft-body panels with hinge/latch physics
     * - Cockpit interior (seats, steering wheel, digital dash)
     * - Detailed engine bay with radiator steam emitter
     * - Twin NOS afterburner flame cones
     * - BeamNG Node-Beam structural skeleton overlay
     */
    function buildSculptedPlayerCar(carKey, envTexture, customOptions = {}) {
        const spec = CAR_SPECS[carKey] || CAR_SPECS.HYPER;
        const profile = spec.profile;
        const isSUV = profile === 'HEAVY_SUV';
        const isArmored = profile === 'MUSCLE_ARMORED';
        const isLMP = profile === 'LMP_PROTOTYPE';
        const isWideDrift = profile === 'WIDEBODY_DRIFT';

        const root = new THREE.Group();
        const chassisGroup = new THREE.Group();
        root.add(chassisGroup);

        const bodyColorHex = customOptions.paintColor !== undefined ? customOptions.paintColor : spec.color;
        const finishType = customOptions.finishType || 'METALLIC'; // METALLIC, MATTE, CHROME

        const paintMat = new THREE.MeshStandardMaterial({
            color: bodyColorHex,
            metalness: finishType === 'CHROME' ? 0.98 : (finishType === 'MATTE' ? 0.22 : 0.82),
            roughness: finishType === 'CHROME' ? 0.05 : (finishType === 'MATTE' ? 0.62 : 0.14),
            vertexColors: true,
            envMap: envTexture,
            envMapIntensity: finishType === 'MATTE' ? 0.6 : 1.75
        });

        const carbonMat = new THREE.MeshStandardMaterial({
            color: spec.accent,
            metalness: 0.55,
            roughness: 0.32,
            vertexColors: true,
            envMap: envTexture
        });

        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x0b1324,
            metalness: 0.95,
            roughness: 0.06,
            transparent: true,
            opacity: 0.78,
            envMap: envTexture,
            envMapIntensity: 2.0
        });

        const chromeMat = new THREE.MeshStandardMaterial({
            color: 0xe2e8f0,
            metalness: 0.95,
            roughness: 0.12
        });

        const deformableMeshes = [];

        // =========================================================================
        // 1. SCULPTED AERODYNAMIC LOWER MONOCOQUE & FENDER ARCHES (Deformable Tub)
        // =========================================================================
        const tubWidth = isWideDrift || isSUV ? 2.08 : 1.98;
        const tubHeight = isSUV ? 0.66 : (isLMP ? 0.44 : 0.52);
        const tubGeo = createSculptedPanelGeometry(tubWidth, tubHeight, 4.25, 12, 6, 22, (nx, ny, nz, v) => {
            // Taper front nose & rear tail aerodynamically
            if (nz < -0.55) {
                const t = (-nz - 0.55) / 0.45;
                v.x *= (1.0 - t * 0.18);
                if (ny > 0) v.y -= t * (isSUV ? 0.08 : 0.19);
            }
            if (nz > 0.65) {
                const t = (nz - 0.65) / 0.35;
                v.x *= (1.0 - t * 0.08);
                if (ny < 0) v.y += t * 0.10; // Rear diffuser upsweep
            }
            // Flare out muscular wheel arches around z = -1.38 and z = +1.38
            const distFrontWheel = Math.abs( v.z - (-1.38) );
            const distRearWheel  = Math.abs( v.z - ( 1.38) );
            if (distFrontWheel < 0.58 && Math.abs(nx) > 0.72) {
                const arch = Math.cos((distFrontWheel / 0.58) * (Math.PI / 2));
                v.x += Math.sign(nx) * arch * (isWideDrift ? 0.16 : 0.11);
                if (ny > 0) v.y += arch * 0.06;
            }
            if (distRearWheel < 0.62 && Math.abs(nx) > 0.72) {
                const arch = Math.cos((distRearWheel / 0.62) * (Math.PI / 2));
                v.x += Math.sign(nx) * arch * (isWideDrift ? 0.19 : 0.14);
                if (ny > 0) v.y += arch * 0.08;
            }
            // Coke-bottle side intake indent in mid-section
            if (Math.abs(v.z) < 0.65 && Math.abs(nx) > 0.8 && Math.abs(ny) < 0.6) {
                v.x *= 0.91;
            }
        }, 1.35);

        const coreMesh = new THREE.Mesh(tubGeo, paintMat.clone());
        coreMesh.position.set(0, isSUV ? 0.58 : 0.46, 0);
        coreMesh.castShadow = true;
        coreMesh.receiveShadow = true;
        chassisGroup.add(coreMesh);
        deformableMeshes.push(coreMesh);

        // =========================================================================
        // 2. COCKPIT INTERIOR (Seats, Steering Wheel, Digital Dash)
        // =========================================================================
        const interiorGroup = new THREE.Group();
        const seatMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
        [-0.38, 0.38].forEach(sx => {
            const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.12), seatMat);
            seatBack.position.set(sx, 0.72, 0.25);
            seatBack.rotation.x = -0.22;
            const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.20, 0.10), new THREE.MeshStandardMaterial({ color: spec.color }));
            headrest.position.set(sx, 1.04, 0.31);
            interiorGroup.add(seatBack, headrest);
        });

        const dashMesh = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.24, 0.45), carbonMat);
        dashMesh.position.set(0, 0.74, -0.52);
        const gaugeCluster = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.05), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
        gaugeCluster.position.set(0.36, 0.84, -0.34);

        const steeringWheel = new THREE.Mesh(
            new THREE.TorusGeometry(0.14, 0.024, 8, 16),
            new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 })
        );
        steeringWheel.position.set(0.36, 0.80, -0.22);
        steeringWheel.rotation.x = -0.35;
        interiorGroup.add(dashMesh, gaugeCluster, steeringWheel);
        chassisGroup.add(interiorGroup);

        // =========================================================================
        // 3. DETAILED ENGINE BAY & RADIATOR UNDER HOOD
        // =========================================================================
        const engineGroup = new THREE.Group();
        const blockMesh = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.38, 0.88), chromeMat);
        const intakePlenum = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.76), new THREE.MeshStandardMaterial({ color: spec.color, metalness: 0.8, roughness: 0.2 }));
        intakePlenum.position.y = 0.22;
        const radiatorCore = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.34, 0.12), new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.3 }));
        radiatorCore.position.set(0, -0.02, -0.55);
        const strutTowerBar = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.04, 0.06), chromeMat);
        strutTowerBar.position.set(0, 0.28, -0.1);
        engineGroup.add(blockMesh, intakePlenum, radiatorCore, strutTowerBar);
        engineGroup.position.set(0, isSUV ? 0.68 : 0.52, -1.32);
        chassisGroup.add(engineGroup);

        // =========================================================================
        // 4. SCULPTED AERODYNAMIC CABIN CANOPY, ROOF & WINDSHIELD (Deformable)
        // =========================================================================
        const cabinGroup = new THREE.Group();
        const cabW = isSUV ? 1.66 : (isLMP ? 1.18 : 1.54);
        const cabH = isSUV ? 0.58 : (isLMP ? 0.42 : 0.46);
        const cabL = isSUV ? 2.35 : (isLMP ? 1.85 : 2.02);

        const cabinGeo = createSculptedPanelGeometry(cabW, cabH, cabL, 10, 6, 14, (nx, ny, nz, v) => {
            if (ny > 0) {
                // Narrow the greenhouse toward the roof (tumblehome angle)
                v.x *= isLMP ? 0.68 : 0.78;
                // Slant the front windshield sharply and slope the rear fastback window
                if (nz < -0.2) {
                    const t = (-nz - 0.2) / 0.8;
                    v.y -= t * cabH * (isSUV ? 0.55 : 0.82);
                    v.x *= (1.0 - t * 0.12);
                } else if (nz > 0.15) {
                    const t = (nz - 0.15) / 0.85;
                    v.y -= t * cabH * (isSUV ? 0.18 : 0.72);
                    v.x *= (1.0 - t * 0.15);
                }
                // Gentle roof crown arch
                v.y += (1.0 - nx * nx) * 0.05;
            }
        }, 1.45);

        const cabinGlassMesh = new THREE.Mesh(cabinGeo, glassMat);
        cabinGlassMesh.position.set(0, isSUV ? 1.08 : 0.86, isSUV ? 0.15 : 0.05);
        cabinGroup.add(cabinGlassMesh);
        deformableMeshes.push(cabinGlassMesh);

        // Painted Roof Panel & A/C Pillars over the glass canopy
        const roofGeo = createSculptedPanelGeometry(cabW * 0.78, 0.07, cabL * 0.55, 8, 2, 8, (nx, ny, nz, v) => {
            v.y += (1.0 - nx * nx) * 0.04 - Math.abs(nz) * 0.03;
        }, 1.3);
        const roofMesh = new THREE.Mesh(roofGeo, paintMat.clone());
        roofMesh.position.set(0, isSUV ? 1.38 : (isLMP ? 1.06 : 1.11), isSUV ? 0.15 : 0.02);
        cabinGroup.add(roofMesh);
        deformableMeshes.push(roofMesh);

        // Windshield Crack Overlay Lines (Initially hidden, appears when windshield takes damage)
        const crackPoints = [];
        for (let c = 0; c < 18; c++) {
            const angle = (c / 18) * Math.PI * 2;
            const len = 0.15 + (c % 3) * 0.14;
            crackPoints.push(new THREE.Vector3(-0.25, 0.92, -0.58));
            crackPoints.push(new THREE.Vector3(-0.25 + Math.cos(angle) * len, 0.92 + Math.sin(angle) * len * 0.5, -0.58 - Math.sin(angle) * len * 0.5));
        }
        const windshieldCracks = new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints(crackPoints),
            new THREE.LineBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.0 })
        );
        cabinGroup.add(windshieldCracks);

        if (isLMP) {
            const sharkFin = new THREE.Mesh(
                makeGeometryDeformable(new THREE.BoxGeometry(0.05, 0.44, 1.48, 2, 4, 8), 1.0),
                carbonMat.clone()
            );
            sharkFin.position.set(0, 1.02, 1.05);
            cabinGroup.add(sharkFin);
            deformableMeshes.push(sharkFin);
        }

        chassisGroup.add(cabinGroup);

        // =========================================================================
        // 5. DETACHABLE & SOFT-BODY DEFORMABLE EXTERIOR PANELS
        // =========================================================================

        // 5A. Sculpted Front Hood (Bonnet) - Hinged at firewall, unlatches & flaps when damaged!
        const hoodGroup = new THREE.Group();
        const hoodGeo = createSculptedPanelGeometry(1.66, 0.11, 1.34, 12, 3, 12, (nx, ny, nz, v) => {
            // Aerodynamic slope down toward front nose
            if (nz < 0) v.y += nz * (isSUV ? 0.06 : 0.16);
            if (nz < -0.3) v.x *= (1.0 + (nz + 0.3) * 0.15);
            // Power dome / twin aero creases on hood
            if (ny > 0 && Math.abs(nx) < 0.45) {
                v.y += 0.045 * Math.cos(nx * Math.PI);
            }
        }, 0.85);
        const hoodMesh = new THREE.Mesh(hoodGeo, paintMat.clone());
        hoodMesh.castShadow = true;
        hoodGroup.add(hoodMesh);
        deformableMeshes.push(hoodMesh);

        // Hood vents / carbon louvers
        const ventL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.42), carbonMat);
        ventL.position.set(-0.42, 0.05, -0.1);
        const ventR = ventL.clone();
        ventR.position.x = 0.42;
        hoodGroup.add(ventL, ventR);

        hoodGroup.position.set(0, isSUV ? 0.90 : 0.72, -1.34);
        chassisGroup.add(hoodGroup);

        // 5B. Sculpted Front Bumper, Splitter, Canards & Bullbar
        const bumperFGroup = new THREE.Group();
        const bfGeo = createSculptedPanelGeometry(2.02, 0.38, 0.48, 14, 5, 6, (nx, ny, nz, v) => {
            // V-shaped nose sweep
            if (nz < 0) v.z -= (1.0 - Math.abs(nx)) * 0.16;
            // Taper outer corners
            if (Math.abs(nx) > 0.75) v.z += (Math.abs(nx) - 0.75) * 0.35;
        }, 0.78);
        const bumperFMesh = new THREE.Mesh(bfGeo, paintMat.clone());
        bumperFGroup.add(bumperFMesh);
        deformableMeshes.push(bumperFMesh);

        const splitterGeo = createSculptedPanelGeometry(2.12, 0.06, 0.62, 12, 2, 4, (nx, ny, nz, v) => {
            if (nz < 0) v.z -= (1.0 - Math.abs(nx)) * 0.14;
        }, 0.8);
        const splitterMesh = new THREE.Mesh(splitterGeo, carbonMat.clone());
        splitterMesh.position.set(0, -0.18, -0.05);
        bumperFGroup.add(splitterMesh);
        deformableMeshes.push(splitterMesh);

        // Front Intake Mesh & Intercooler
        const frontGrille = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.24, 0.50), carbonMat);
        frontGrille.position.set(0, -0.03, -0.04);
        const intercooler = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.19, 0.52), chromeMat);
        intercooler.position.set(0, -0.04, -0.04);
        bumperFGroup.add(frontGrille, intercooler);

        if (isArmored || isSUV) {
            // Heavy Steel Push-Bar / Ram Guard
            const bullbar = new THREE.Group();
            const postL = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.56, 0.12), chromeMat);
            postL.position.set(-0.52, 0.12, -0.32);
            const postR = postL.clone();
            postR.position.x = 0.52;
            const crossTop = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.09, 0.12), chromeMat);
            crossTop.position.set(0, 0.28, -0.32);
            const crossMid = crossTop.clone();
            crossMid.position.y = 0.02;
            bullbar.add(postL, postR, crossTop, crossMid);
            bumperFGroup.add(bullbar);
        }

        bumperFGroup.position.set(0, isSUV ? 0.46 : 0.36, -2.08);
        chassisGroup.add(bumperFGroup);

        // 5C. Sculpted Left & Right Doors with Side Skirts & Aero Mirrors
        const buildSculptedDoor = (sideSign) => {
            const dGroup = new THREE.Group();
            const dGeo = createSculptedPanelGeometry(0.22, isSUV ? 0.68 : 0.54, 1.92, 4, 6, 12, (nx, ny, nz, v) => {
                // Curved door skin profile + side air channel scoop
                if (Math.sign(nx) === sideSign) {
                    v.x += sideSign * Math.sin((ny + 1) * Math.PI * 0.5) * 0.06;
                    if (nz > -0.2 && Math.abs(ny) < 0.45) {
                        v.x -= sideSign * 0.055 * ((nz + 0.2) / 1.2);
                    }
                }
            }, 0.90);
            const dMesh = new THREE.Mesh(dGeo, paintMat.clone());
            dMesh.castShadow = true;
            dGroup.add(dMesh);
            deformableMeshes.push(dMesh);

            const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.10, 1.96), carbonMat.clone());
            skirt.position.set(sideSign * 0.03, -0.25, 0);
            dGroup.add(skirt);

            // Sculpted Side Mirror on Stalk
            const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.06), carbonMat);
            mirrorArm.position.set(sideSign * 0.14, 0.28, -0.58);
            const mirrorCap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.11, 0.15), paintMat.clone());
            mirrorCap.position.set(sideSign * 0.22, 0.31, -0.58);
            dGroup.add(mirrorArm, mirrorCap);

            dGroup.position.set(sideSign * (tubWidth * 0.47), isSUV ? 0.66 : 0.54, 0.0);
            return { dGroup, dMesh };
        };

        const leftDoorObj = buildSculptedDoor(-1);
        const rightDoorObj = buildSculptedDoor(1);
        chassisGroup.add(leftDoorObj.dGroup, rightDoorObj.dGroup);

        // 5D. Sculpted Rear Decklid / Trunk & Rear Diffuser Bumper
        const trunkGroup = new THREE.Group();
        const trunkGeo = createSculptedPanelGeometry(1.88, isSUV ? 0.62 : 0.44, 1.18, 12, 5, 10, (nx, ny, nz, v) => {
            if (ny > 0 && nz > 0) {
                v.y -= nz * 0.08;
            }
            if (Math.abs(nx) > 0.7) {
                v.y += 0.04; // Rear haunch fenders
            }
        }, 0.92);
        const trunkMesh = new THREE.Mesh(trunkGeo, paintMat.clone());
        trunkMesh.castShadow = true;
        trunkGroup.add(trunkMesh);
        deformableMeshes.push(trunkMesh);

        // Rear Diffuser Fins
        const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.18, 0.35), carbonMat);
        diffuser.position.set(0, -0.22, 0.48);
        trunkGroup.add(diffuser);

        trunkGroup.position.set(0, isSUV ? 0.72 : 0.60, 1.56);
        chassisGroup.add(trunkGroup);

        // 5E. Sculpted Aerodynamic GT Wing (Active Aero / Swan-Neck)
        const wingGroup = new THREE.Group();
        const wingSpan = isLMP || isWideDrift ? 2.18 : 2.02;
        const wingGeo = createSculptedPanelGeometry(wingSpan, 0.07, 0.38, 12, 2, 4, (nx, ny, nz, v) => {
            // Downforce camber curve & swept wingtips
            v.z += Math.abs(nx) * 0.10;
            v.y += Math.abs(nx) * 0.04;
            if (nz > 0) v.y += 0.035; // Gurney flap kick
        }, 0.75);
        const wingBlade = new THREE.Mesh(wingGeo, carbonMat.clone());
        wingBlade.position.y = 0.36;
        deformableMeshes.push(wingBlade);

        const endplateGeo = new THREE.BoxGeometry(0.04, 0.28, 0.46);
        const epL = new THREE.Mesh(endplateGeo, paintMat.clone());
        epL.position.set(-wingSpan * 0.5, 0.34, 0.05);
        const epR = epL.clone();
        epR.position.x = wingSpan * 0.5;

        const strutGeo = new THREE.BoxGeometry(0.06, 0.36, 0.22);
        const strutL = new THREE.Mesh(strutGeo, carbonMat);
        strutL.position.set(-0.56, 0.18, 0);
        const strutR = strutL.clone();
        strutR.position.x = 0.56;

        wingGroup.add(wingBlade, epL, epR, strutL, strutR);
        wingGroup.position.set(0, isSUV ? 1.12 : 0.86, 1.92);
        chassisGroup.add(wingGroup);

        // =========================================================================
        // 6. HEADLIGHTS, DRL STRIPS, TAILLIGHTS, QUAD EXHAUSTS & NOS FLAMES
        // =========================================================================
        const hlMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
        const drlMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

        [-1, 1].forEach(side => {
            const hlHousing = new THREE.Group();
            const mainLens = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.14), hlMat);
            mainLens.rotation.y = side * 0.22;
            const drlStrip = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.035, 0.15), drlMat);
            drlStrip.position.y = -0.06;
            drlStrip.rotation.y = side * 0.22;
            hlHousing.add(mainLens, drlStrip);
            hlHousing.position.set(side * 0.72, isSUV ? 0.76 : 0.58, -2.22);
            chassisGroup.add(hlHousing);
        });

        const spotL = new THREE.SpotLight(0xe0f2fe, 2.8, 90, Math.PI / 4.8, 0.45, 1.1);
        spotL.position.set(-0.68, 0.72, -2.15);
        spotL.target.position.set(-0.8, 0.1, -45);
        chassisGroup.add(spotL, spotL.target);

        const spotR = new THREE.SpotLight(0xe0f2fe, 2.8, 90, Math.PI / 4.8, 0.45, 1.1);
        spotR.position.set(0.68, 0.72, -2.15);
        spotR.target.position.set(0.8, 0.1, -45);
        chassisGroup.add(spotR, spotR.target);

        // LED Full-Width Cyberpunk Taillight Bar + Twin Brake Rings
        const tailBar = new THREE.Mesh(
            new THREE.BoxGeometry(1.82, 0.13, 0.10),
            new THREE.MeshBasicMaterial({ color: 0xff1133 })
        );
        tailBar.position.set(0, isSUV ? 0.88 : 0.72, 2.15);
        chassisGroup.add(tailBar);

        // Quad Titanium Exhaust Pipes + Twin Blue NOS Flame Cones
        const nosFlames = [];
        [-0.58, -0.40, 0.40, 0.58].forEach((ex, idx) => {
            const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.34, 12), chromeMat);
            pipe.rotation.x = Math.PI / 2;
            pipe.position.set(ex, 0.32, 2.16);
            chassisGroup.add(pipe);

            const flameGeo = new THREE.ConeGeometry(0.09, 0.85, 10);
            flameGeo.rotateX(Math.PI / 2);
            const flameMat = new THREE.MeshBasicMaterial({
                color: idx % 2 === 0 ? 0x38bdf8 : 0x818cf8,
                transparent: true,
                opacity: 0.0
            });
            const flame = new THREE.Mesh(flameGeo, flameMat);
            flame.position.set(ex, 0.32, 2.65);
            chassisGroup.add(flame);
            nosFlames.push(flame);
        });

        // Neon Underglow Plane
        const underglowMat = new THREE.MeshBasicMaterial({
            color: customOptions.underglowColor !== undefined ? customOptions.underglowColor : spec.underglowColor,
            transparent: true,
            opacity: customOptions.underglowEnabled === false ? 0.0 : 0.48,
            side: THREE.DoubleSide
        });
        const underglowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.88, 3.75), underglowMat);
        underglowMesh.rotation.x = Math.PI / 2;
        underglowMesh.position.set(0, 0.05, 0);
        chassisGroup.add(underglowMesh);

        // =========================================================================
        // 7. 4 INDEPENDENT WHEEL & SUSPENSION ASSEMBLIES
        // =========================================================================
        const wheelRadius = isSUV ? 0.45 : 0.39;
        const wheelTrackX = isWideDrift || isSUV ? 1.06 : 1.01;
        const wheelConfigs = [
            { id: 'FL', label: '左前輪 (FL)', side: -1, isFront: true,  pos: [-wheelTrackX, wheelRadius, -1.38], schemId: 'schem-tire-FL' },
            { id: 'FR', label: '右前輪 (FR)', side:  1, isFront: true,  pos: [ wheelTrackX, wheelRadius, -1.38], schemId: 'schem-tire-FR' },
            { id: 'RL', label: '左後輪 (RL)', side: -1, isFront: false, pos: [-wheelTrackX, wheelRadius,  1.38], schemId: 'schem-tire-RL' },
            { id: 'RR', label: '右後輪 (RR)', side:  1, isFront: false, pos: [ wheelTrackX, wheelRadius,  1.38], schemId: 'schem-tire-RR' }
        ];

        const wheels = [];
        const wheelStates = [];

        wheelConfigs.forEach(cfg => {
            const { hubGroup, spinGroup, tireMesh, rimMesh, rotorMat } = buildDetailedWheelAssembly(spec, cfg.side, wheelRadius, 0.34);
            hubGroup.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
            root.add(hubGroup);

            wheels.push(spinGroup);
            wheelStates.push({
                id: cfg.id,
                label: cfg.label,
                side: cfg.side,
                isFront: cfg.isFront,
                schemId: cfg.schemId,
                hubGroup,
                spinGroup,
                tireMesh,
                rimMesh,
                rotorMat,
                origX: cfg.pos[0],
                origY: cfg.pos[1],
                origZ: cfg.pos[2],
                suspOffsetY: 0,
                suspVelY: 0,
                bentToe: 0,
                bentCamber: 0,
                hp: 100,
                bent: false,
                punctured: false,
                detached: false
            });
        });

        // =========================================================================
        // 8. BEAMNG NODE-BEAM STRUCTURAL SKELETON OVERLAY
        // =========================================================================
        const beamSkeleton = createNodeBeamSkeleton(profile);
        chassisGroup.add(beamSkeleton);

        return {
            root,
            chassisGroup,
            coreMesh,
            cabinGlassMesh,
            windshieldCracks,
            steeringWheel,
            tailBar,
            underglowMesh,
            nosFlames,
            beamSkeleton,
            deformableMeshes,
            wheels,
            wheelStates,
            headlightL: spotL,
            headlightR: spotR,
            subsystems: {
                engineHp: 100,
                radiatorHp: 100,
                steeringHp: 100,
                chassisIntegrity: 100,
                alignmentPull: 0 // Persistent steering pull caused by bent tie-rods
            },
            parts: {
                hood: {
                    mesh: hoodGroup,
                    deformMesh: hoodMesh,
                    hp: 100,
                    latchBroken: false,
                    detached: false,
                    flapAngle: 0,
                    origPos: hoodGroup.position.clone(),
                    size: [1.66, 0.14, 1.34],
                    schemId: 'schem-hood',
                    label: 'ボンネット (HOOD)'
                },
                bumperF: {
                    mesh: bumperFGroup,
                    deformMesh: bumperFMesh,
                    hp: 100,
                    latchBroken: false,
                    detached: false,
                    flapAngle: 0,
                    origPos: bumperFGroup.position.clone(),
                    size: [2.02, 0.38, 0.48],
                    schemId: 'schem-bumperF',
                    label: 'フロントバンパー (FRONT BUMPER)'
                },
                doorL: {
                    mesh: leftDoorObj.dGroup,
                    deformMesh: leftDoorObj.dMesh,
                    hp: 100,
                    latchBroken: false,
                    detached: false,
                    flapAngle: 0,
                    origPos: leftDoorObj.dGroup.position.clone(),
                    size: [0.22, 0.56, 1.92],
                    schemId: 'schem-doorL',
                    label: '左ドア (LEFT DOOR)'
                },
                doorR: {
                    mesh: rightDoorObj.dGroup,
                    deformMesh: rightDoorObj.dMesh,
                    hp: 100,
                    latchBroken: false,
                    detached: false,
                    flapAngle: 0,
                    origPos: rightDoorObj.dGroup.position.clone(),
                    size: [0.22, 0.56, 1.92],
                    schemId: 'schem-doorR',
                    label: '右ドア (RIGHT DOOR)'
                },
                trunk: {
                    mesh: trunkGroup,
                    deformMesh: trunkMesh,
                    hp: 100,
                    latchBroken: false,
                    detached: false,
                    flapAngle: 0,
                    origPos: trunkGroup.position.clone(),
                    size: [1.88, 0.46, 1.18],
                    schemId: 'schem-trunk',
                    label: 'リアトランク (REAR DECK)'
                },
                wing: {
                    mesh: wingGroup,
                    deformMesh: wingBlade,
                    hp: 100,
                    latchBroken: false,
                    detached: false,
                    flapAngle: 0,
                    origPos: wingGroup.position.clone(),
                    size: [2.02, 0.32, 0.42],
                    schemId: 'schem-wing',
                    label: 'GTウイング (AERO WING)'
                }
            }
        };
    }

    function createElderlyBadgeMesh() {
        const markGroup = new THREE.Group();
        const leafL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.36, 0.04), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
        leafL.rotation.z = 0.28;
        leafL.position.x = -0.15;
        const leafR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.36, 0.04), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
        leafR.rotation.z = -0.28;
        leafR.position.x = 0.15;
        const stem = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.04), new THREE.MeshBasicMaterial({ color: 0x16a34a }));
        stem.position.y = -0.22;
        markGroup.add(leafL, leafR, stem);
        markGroup.scale.set(0.9, 0.9, 0.9);
        return markGroup;
    }

    function createEmotionBillboardSprite(group, carHeight) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const texture = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(3.4, 0.85, 1.0);
        sprite.position.set(0, carHeight + 0.95, 0);
        sprite.visible = false;
        group.add(sprite);

        let hideTimeout = null;
        const setEmotion = (text, bgColor = '#dc2626', textColor = '#ffffff') => {
            ctx.clearRect(0, 0, 256, 64);
            ctx.fillStyle = bgColor;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(8, 8, 240, 48, 24);
            } else {
                ctx.rect(8, 8, 240, 48);
            }
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            ctx.fillStyle = textColor;
            ctx.font = 'bold 20px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 128, 32);

            texture.needsUpdate = true;
            sprite.visible = true;

            if (hideTimeout) clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                sprite.visible = false;
            }, 2600);
        };

        return { sprite, setEmotion };
    }

    /**
     * Builds a Sculpted, Deformable Traffic Vehicle so AI cars also look realistic
     * AND crumple / deform vertex-by-vertex when hit!
     */
    function buildSculptedTrafficVehicle(type, bodyColor, envTexture) {
        const group = new THREE.Group();
        let width = 1.92, height = 1.38, length = 4.35;
        let sirenBar = null;
        let hazardLights = null;
        const deformableTrafficMeshes = [];

        const bodyMat = new THREE.MeshStandardMaterial({
            color: bodyColor,
            metalness: type === 'ROAD_RAGE' ? 0.92 : 0.72,
            roughness: type === 'ROAD_RAGE' ? 0.12 : 0.22,
            vertexColors: true,
            envMap: envTexture
        });

        const cabinMat = new THREE.MeshStandardMaterial({
            color: type === 'POLICE' ? 0xf8fafc : 0x0b111e,
            metalness: 0.90,
            roughness: 0.12,
            vertexColors: true,
            envMap: envTexture
        });

        if (type === 'TRUCK') {
            width = 2.42;
            height = 2.95;
            length = 7.6;
            const cargoGeo = createSculptedPanelGeometry(2.42, 2.25, 5.5, 6, 6, 10, () => {}, 1.4);
            const cargo = new THREE.Mesh(
                cargoGeo,
                new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.42, metalness: 0.38, vertexColors: true })
            );
            cargo.position.set(0, 1.52, 0.8);
            cargo.castShadow = true;
            group.add(cargo);
            deformableTrafficMeshes.push(cargo);

            const cabGeo = createSculptedPanelGeometry(2.26, 1.75, 1.85, 6, 6, 6, (nx, ny, nz, v) => {
                if (ny > 0.2 && nz < 0) v.z -= nz * 0.22;
            }, 1.2);
            const cab = new THREE.Mesh(cabGeo, bodyMat);
            cab.position.set(0, 1.25, -2.85);
            cab.castShadow = true;
            group.add(cab);
            deformableTrafficMeshes.push(cab);
        } else {
            if (type === 'WRONG_WAY') {
                width = 1.76;
                length = 3.75;
            } else if (type === 'ROAD_RAGE') {
                width = 2.12;
                length = 4.82;
            } else if (type === 'SUV') {
                width = 2.08;
                length = 4.65;
            }

            // Sculpted Lower Body with tapered nose & wheel arches
            const lowerGeo = createSculptedPanelGeometry(width, 0.62, length, 8, 4, 12, (nx, ny, nz, v) => {
                if (nz < -0.55) {
                    const t = (-nz - 0.55) / 0.45;
                    v.x *= (1.0 - t * 0.14);
                    if (ny > 0) v.y -= t * 0.14;
                }
                if (nz > 0.65) {
                    const t = (nz - 0.65) / 0.35;
                    v.x *= (1.0 - t * 0.08);
                }
            }, 0.9);
            const lower = new THREE.Mesh(lowerGeo, bodyMat);
            lower.position.y = 0.58;
            lower.castShadow = true;
            group.add(lower);
            deformableTrafficMeshes.push(lower);

            // Sculpted Greenhouse Cabin with slanted windshield
            const cabH = (type === 'WRONG_WAY' || type === 'SUV' || type === 'ROAD_RAGE') ? 0.62 : 0.48;
            const cabL = (type === 'WRONG_WAY' || type === 'SUV' || type === 'ROAD_RAGE') ? length * 0.66 : length * 0.52;
            const upperGeo = createSculptedPanelGeometry(width * 0.86, cabH, cabL, 6, 4, 8, (nx, ny, nz, v) => {
                if (ny > 0) {
                    v.x *= 0.82;
                    if (nz < -0.25) v.y -= ((-nz - 0.25) / 0.75) * cabH * 0.68;
                    if (nz > 0.25)  v.y -= (( nz - 0.25) / 0.75) * cabH * (type === 'WRONG_WAY' ? 0.25 : 0.62);
                }
            }, 1.0);
            const upper = new THREE.Mesh(upperGeo, cabinMat);
            upper.position.set(0, 1.08, 0.08);
            upper.castShadow = true;
            group.add(upper);
            deformableTrafficMeshes.push(upper);

            if (type === 'WRONG_WAY') {
                // Koreisha Elderly Driver Mark on Roof & Hood
                const markGroup = new THREE.Group();
                const leafL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.08), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
                leafL.position.x = -0.21;
                const leafR = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.08), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
                leafR.position.x = 0.21;
                markGroup.add(leafL, leafR);
                markGroup.position.set(0, 1.75, 0);
                group.add(markGroup);
                sirenBar = markGroup;

                hazardLights = new THREE.Mesh(
                    new THREE.BoxGeometry(width * 0.92, 0.24, 0.14),
                    new THREE.MeshBasicMaterial({ color: 0xfef08a })
                );
                hazardLights.position.set(0, 0.68, -length / 2 - 0.04);
                group.add(hazardLights);
            } else if (type === 'ROAD_RAGE') {
                const grille = new THREE.Mesh(
                    new THREE.BoxGeometry(width * 0.76, 0.46, 0.12),
                    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 })
                );
                grille.position.set(0, 0.60, -length / 2 - 0.02);
                group.add(grille);

                sirenBar = new THREE.Group();
                const rageL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.20, 0.22), new THREE.MeshBasicMaterial({ color: 0xd946ef }));
                rageL.position.x = -0.32;
                const rageR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.20, 0.22), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
                rageR.position.x = 0.32;
                sirenBar.add(rageL, rageR);
                sirenBar.position.set(0, 1.66, 0);
                group.add(sirenBar);

                hazardLights = new THREE.Mesh(
                    new THREE.BoxGeometry(width * 0.92, 0.20, 0.12),
                    new THREE.MeshBasicMaterial({ color: 0xf59e0b })
                );
                hazardLights.position.set(0, 0.88, length / 2 + 0.04);
                group.add(hazardLights);
            } else if (type === 'POLICE') {
                sirenBar = new THREE.Group();
                const redLight = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.22), new THREE.MeshBasicMaterial({ color: 0xff0033 }));
                redLight.position.x = -0.32;
                const blueLight = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.22), new THREE.MeshBasicMaterial({ color: 0x0066ff }));
                blueLight.position.x = 0.32;
                sirenBar.add(redLight, blueLight);
                sirenBar.position.set(0, 1.42, -0.02);
                group.add(sirenBar);
            }
        }

        // Headlights & Taillights
        const tailMat = new THREE.MeshBasicMaterial({ color: 0xff1e42 });
        const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.10), tailMat);
        tailL.position.set(-width * 0.34, 0.68, length / 2 + 0.02);
        const tailR = tailL.clone();
        tailR.position.x = width * 0.34;
        group.add(tailL, tailR);

        const headMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
        const headL = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.15, 0.10), headMat);
        headL.position.set(-width * 0.34, 0.64, -length / 2 - 0.02);
        const headR = headL.clone();
        headR.position.x = width * 0.34;
        group.add(headL, headR);

        // 4 Wheels with Alloy Rims
        const wGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 16);
        wGeo.rotateZ(Math.PI / 2);
        const wMat = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.8 });
        const rGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.30, 12);
        rGeo.rotateZ(Math.PI / 2);
        const rMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.2 });

        [[-width / 2, 0.36, -length * 0.32], [width / 2, 0.36, -length * 0.32], [-width / 2, 0.36, length * 0.32], [width / 2, 0.36, length * 0.32]].forEach(p => {
            const wGroup = new THREE.Group();
            wGroup.add(new THREE.Mesh(wGeo, wMat), new THREE.Mesh(rGeo, rMat));
            wGroup.position.set(p[0], p[1], p[2]);
            group.add(wGroup);
        });

        // Emotion Billboard Sprite
        const { sprite: emotionSprite, setEmotion } = createEmotionBillboardSprite(group, height || 1.38);

        // Elderly Driver 3D Badges
        if (type === 'WRONG_WAY' || type === 'ELDERLY_CIVILIAN') {
            const badgeR = createElderlyBadgeMesh();
            badgeR.position.set(width * 0.28, 0.82, length / 2 + 0.04);
            const badgeF = createElderlyBadgeMesh();
            badgeF.position.set(-width * 0.28, 0.72, -length / 2 - 0.04);
            group.add(badgeR, badgeF);
        }

        // Road Rage GT Carbon Wing
        if (type === 'ROAD_RAGE') {
            const wingGroup = new THREE.Group();
            const blade = new THREE.Mesh(new THREE.BoxGeometry(width * 0.88, 0.06, 0.38), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.8 }));
            const standL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.12), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9 }));
            standL.position.set(-width * 0.32, -0.13, 0);
            const standR = standL.clone();
            standR.position.x = width * 0.32;
            wingGroup.add(blade, standL, standR);
            wingGroup.position.set(0, 1.24, length / 2 - 0.32);
            group.add(wingGroup);
        }

        return {
            group,
            width,
            height,
            length,
            sirenBar,
            hazardLights,
            tailL,
            tailR,
            headL,
            headR,
            emotionSprite,
            setEmotion,
            deformableTrafficMeshes
        };
    }

    global.ApexCarBuilder = {
        CAR_SPECS,
        buildSculptedPlayerCar,
        buildSculptedTrafficVehicle,
        deformMeshAtPoint,
        resetDeformableMesh,
        deformNodeBeamSkeleton,
        resetNodeBeamSkeleton
    };
})(window);
