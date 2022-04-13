/* eslint-disable */
'use strict';
import * as CANNON from 'cannon';
import * as THREE from 'three';
import imgs from './imgs'
class DiceManagerClass {
    constructor() {
        this.world = null;
    }

    /** 设置物理参数 */
    setWorld(world) {
        this.world = world;

        this.diceBodyMaterial = new CANNON.Material();
        this.floorBodyMaterial = new CANNON.Material();
        this.barrierBodyMaterial = new CANNON.Material();

        world.addContactMaterial(
            new CANNON.ContactMaterial(this.floorBodyMaterial, this.diceBodyMaterial, { friction: 0.01, restitution: 0.5 })
        );
        world.addContactMaterial(
            new CANNON.ContactMaterial(this.barrierBodyMaterial, this.diceBodyMaterial, { friction: 0, restitution: 1.0 })
        );
        world.addContactMaterial(
            new CANNON.ContactMaterial(this.diceBodyMaterial, this.diceBodyMaterial, { friction: 0, restitution: 0.5 })
        );
    }

    /**
     *
     * @param {array} diceValues
     * @param {DiceObject} [diceValues.dice]
     * @param {number} [diceValues.value]
     *
     */
    prepareValues(diceValues) {
        if (this.throwRunning) throw new Error('Cannot start another throw. Please wait, till the current throw is finished.');

        for (let i = 0; i < diceValues.length; i++) {
            if (diceValues[i].value < 1 || diceValues[i].dice.values < diceValues[i].value) {
                throw new Error('Cannot throw die to value ' + diceValues[i].value + ', because it has only ' + diceValues[i].dice.values + ' sides.');
            }
        }

        this.throwRunning = true;

        for (let i = 0; i < diceValues.length; i++) {
            diceValues[i].dice.simulationRunning = true;
            diceValues[i].vectors = diceValues[i].dice.getCurrentVectors();
            diceValues[i].stableCount = 0;
        }

        const check = () => {
            let allStable = true;
            for (let i = 0; i < diceValues.length; i++) {
                if (diceValues[i].dice.isFinished()) {
                    diceValues[i].stableCount++;
                } else {
                    diceValues[i].stableCount = 0;
                }

                if (diceValues[i].stableCount < 50) {
                    allStable = false;
                }
            }

            if (allStable) {
                console.log("all stable");
                DiceManager.world.removeEventListener('postStep', check);

                for (let i = 0; i < diceValues.length; i++) {
                    diceValues[i].dice.shiftUpperValue(diceValues[i].value);
                    diceValues[i].dice.resetBody();
                    diceValues[i].dice.setVectors(diceValues[i].vectors);
                    diceValues[i].dice.simulationRunning = false;
                }

                this.throwRunning = false;
            } else {
                DiceManager.world.step(DiceManager.world.dt);
            }
        };

        this.world.addEventListener('postStep', check);
    }
}

class DiceObject {
    /**
     * @constructor
     * @param {object} options
     * @param {Number} [options.size = 100]
     * @param {Number} [options.fontColor = '#000000']
     * @param {Number} [options.backColor = '#ffffff']
     */
    constructor(options) {
        options = this.setDefaults(options, {
            size: 100,
            fontColor: '#000000',
            backColor: '#ffffff'
        });

        this.object = null;
        this.size = options.size;
        this.invertUpside = false;
        // 基础色（红色）
        this.baseColor = '#de482b'
        this.materialOptions = {
            // 材质的颜色
            // color: 0xde482b,
            // // 材质的高光颜色
            // specular: 0xde482b,
            // // specular高亮的程度，越高的值越闪亮
            // shininess: 0,
            // // 定义材质是否使用平面着色进行渲染
            // flatShading: true,
            //shading: THREE.FlatShading,
        };
    }

    setDefaults(options, defaults) {
        options = options || {};

        for (const key in defaults) {
            if (!defaults.hasOwnProperty(key)) continue;

            if (!(key in options)) {
                options[key] = defaults[key];
            }
        }

        return options;
    }

    emulateThrow(callback) {
        let stableCount = 0;

        const check = () => {
            if (this.isFinished()) {
                stableCount++;

                if (stableCount === 50) {
                    DiceManager.world.removeEventListener('postStep', check);
                    callback(this.getUpsideValue());
                }
            } else {
                stableCount = 0;
            }

            DiceManager.world.step(DiceManager.world.dt);
        };

        DiceManager.world.addEventListener('postStep', check);
    }

    isFinished() {
        const threshold = 1;

        const angularVelocity = this.object.body.angularVelocity;
        const velocity = this.object.body.velocity;

        return (Math.abs(angularVelocity.x) < threshold && Math.abs(angularVelocity.y) < threshold && Math.abs(angularVelocity.z) < threshold &&
            Math.abs(velocity.x) < threshold && Math.abs(velocity.y) < threshold && Math.abs(velocity.z) < threshold);
    }

    getUpsideValue() {
        const vector = new THREE.Vector3(0, this.invertUpside ? -1 : 1);
        let closest_face;
        let closest_angle = Math.PI * 2;

        const normals = this.object.geometry.getAttribute('normal').array;
        for (let i = 0; i < this.object.geometry.groups.length; ++i) {
            const face = this.object.geometry.groups[i];
            if (face.materialIndex === 0) continue;

            //Each group consists in 3 vertices of 3 elements (x, y, z) so the offset between faces in the Float32BufferAttribute is 9
            const startVertex = i * 9;
            const normal = new THREE.Vector3(normals[startVertex], normals[startVertex + 1], normals[startVertex + 2]);
            const angle = normal.clone().applyQuaternion(this.object.body.quaternion).angleTo(vector);
            if (angle < closest_angle) {
                closest_angle = angle;
                closest_face = face;
            }
        }

        return closest_face.materialIndex - 1;
    }

    getCurrentVectors() {
        return {
            position: this.object.body.position.clone(),
            quaternion: this.object.body.quaternion.clone(),
            velocity: this.object.body.velocity.clone(),
            angularVelocity: this.object.body.angularVelocity.clone()
        };
    }

    setVectors(vectors) {
        this.object.body.position = vectors.position;
        this.object.body.quaternion = vectors.quaternion;
        this.object.body.velocity = vectors.velocity;
        this.object.body.angularVelocity = vectors.angularVelocity;
    }

    shiftUpperValue(toValue) {
        const geometry = this.object.geometry.clone();

        const fromValue = this.getUpsideValue();
        for (let i = 0, l = geometry.groups.length; i < l; ++i) {
            let materialIndex = geometry.groups[i].materialIndex;
            if (materialIndex === 0) continue;

            materialIndex += toValue - fromValue - 1;
            while (materialIndex > this.values) materialIndex -= this.values;
            while (materialIndex < 1) materialIndex += this.values;

            geometry.groups[i].materialIndex = materialIndex + 1;
        }

        this.updateMaterialsForValue(toValue - fromValue);

        this.object.geometry = geometry;
    }

    getChamferGeometry(vectors, faces, chamfer) {
        const chamfer_vectors = [], chamfer_faces = [], corner_faces = new Array(vectors.length);
        for (let i = 0; i < vectors.length; ++i) corner_faces[i] = [];
        for (let i = 0; i < faces.length; ++i) {
            const ii = faces[i], fl = ii.length - 1;
            const center_point = new THREE.Vector3();
            const face = new Array(fl);
            for (let j = 0; j < fl; ++j) {
                const vv = vectors[ii[j]].clone();
                center_point.add(vv);
                corner_faces[ii[j]].push(face[j] = chamfer_vectors.push(vv) - 1);
            }
            center_point.divideScalar(fl);
            for (let j = 0; j < fl; ++j) {
                const vv = chamfer_vectors[face[j]];
                vv.subVectors(vv, center_point).multiplyScalar(chamfer).addVectors(vv, center_point);
            }
            face.push(ii[fl]);
            chamfer_faces.push(face);
        }
        for (let i = 0; i < faces.length - 1; ++i) {
            for (let j = i + 1; j < faces.length; ++j) {
                let pairs = [], lastm = -1;
                for (let m = 0; m < faces[i].length - 1; ++m) {
                    const n = faces[j].indexOf(faces[i][m]);
                    if (n >= 0 && n < faces[j].length - 1) {
                        if (lastm >= 0 && m !== lastm + 1) pairs.unshift([i, m], [j, n]);
                        else pairs.push([i, m], [j, n]);
                        lastm = m;
                    }
                }
                if (pairs.length !== 4) continue;
                chamfer_faces.push([chamfer_faces[pairs[0][0]][pairs[0][1]],
                chamfer_faces[pairs[1][0]][pairs[1][1]],
                chamfer_faces[pairs[3][0]][pairs[3][1]],
                chamfer_faces[pairs[2][0]][pairs[2][1]], -1]);
            }
        }
        for (let i = 0; i < corner_faces.length; ++i) {
            let cf = corner_faces[i], face = [cf[0]], count = cf.length - 1;
            while (count) {
                for (let m = faces.length; m < chamfer_faces.length; ++m) {
                    let index = chamfer_faces[m].indexOf(face[face.length - 1]);
                    if (index >= 0 && index < 4) {
                        if (--index === -1) index = 3;
                        const next_vertex = chamfer_faces[m][index];
                        if (cf.indexOf(next_vertex) >= 0) {
                            face.push(next_vertex);
                            break;
                        }
                    }
                }
                --count;
            }
            face.push(-1);
            chamfer_faces.push(face);
        }
        return { vectors: chamfer_vectors, faces: chamfer_faces };
    }

    makeGeometry(vertices, faces, radius, tab, af) {
        const geom = new THREE.BufferGeometry();

        for (let i = 0; i < vertices.length; ++i) {
            vertices[i] = vertices[i].multiplyScalar(radius);
        }

        const positions = [];
        const normals = [];
        const uvs = [];

        const cb = new THREE.Vector3();
        const ab = new THREE.Vector3();
        let materialIndex;
        let faceFirstVertexIndex = 0;

        for (let i = 0; i < faces.length; ++i) {
            const ii = faces[i], fl = ii.length - 1;
            const aa = Math.PI * 2 / fl;
            materialIndex = ii[fl] + 1;
            for (let j = 0; j < fl - 2; ++j) {

                //Vertices
                positions.push(...vertices[ii[0]].toArray());
                positions.push(...vertices[ii[j + 1]].toArray());
                positions.push(...vertices[ii[j + 2]].toArray());

                // Flat face normals
                cb.subVectors(vertices[ii[j + 2]], vertices[ii[j + 1]]);
                ab.subVectors(vertices[ii[0]], vertices[ii[j + 1]]);
                cb.cross(ab);
                cb.normalize();

                // Vertex Normals
                normals.push(...cb.toArray());
                normals.push(...cb.toArray());
                normals.push(...cb.toArray());

                //UVs
                uvs.push((Math.cos(af) + 1 + tab) / 2 / (1 + tab), (Math.sin(af) + 1 + tab) / 2 / (1 + tab));
                uvs.push((Math.cos(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab), (Math.sin(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab));
                uvs.push((Math.cos(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab), (Math.sin(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab));
            }

            //Set Group for face materials.
            const numOfVertices = (fl - 2) * 3;
            for (let i = 0; i < numOfVertices / 3; i++) {
                geom.addGroup(faceFirstVertexIndex, 3, materialIndex);
                faceFirstVertexIndex += 3;
            }

        }

        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
        return geom;
    }

    createShape(vertices, faces, radius) {
        const cv = new Array(vertices.length), cf = new Array(faces.length);
        for (let i = 0; i < vertices.length; ++i) {
            const v = vertices[i];
            cv[i] = new CANNON.Vec3(v.x * radius, v.y * radius, v.z * radius);
        }
        for (let i = 0; i < faces.length; ++i) {
            cf[i] = faces[i].slice(0, faces[i].length - 1);
        }
        return new CANNON.ConvexPolyhedron(cv, cf);
    }

    getGeometry() {
        const radius = this.size * this.scaleFactor;
        console.log(radius)
        const vectors = new Array(this.vertices.length);
        for (let i = 0; i < this.vertices.length; ++i) {
            vectors[i] = (new THREE.Vector3).fromArray(this.vertices[i]).normalize();
        }

        const chamferGeometry = this.getChamferGeometry(vectors, this.faces, this.chamfer);
        const geometry = this.makeGeometry(chamferGeometry.vectors, chamferGeometry.faces, radius, this.tab, this.af);
        geometry.cannon_shape = this.createShape(vectors, this.faces, radius);

        return geometry;
    }

    getImage(imgUrl, context, index) {
        return new Promise((resolve, reject) => {
            var imgObj = new Image()
            let currentIdx = 0
            if (index > 2) {
                currentIdx = index - 2
            }
            imgObj.src = imgs[currentIdx]
            imgObj.onload = function () {

                if (index > 1) context.drawImage(imgObj, 0, 0, 300, 300);

                resolve('')
            }
        })
    }

    /** 获取物体材质 */
    async createTextTexture(index) {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = canvas.height = 300;
        context.fillStyle = this.baseColor;

        context.fillRect(0, 0, canvas.width, canvas.height);
        await this.getImage(`//image.yitong.com/ysy/demo/${index < 2 ? '1' : this.faceTexts[index]}.png`, context, index)
        const texture = new THREE.Texture(canvas);

        texture.needsUpdate = true;
        return texture;
    }
    async getMaterials() {
        const materials = [];
        for (let i = 0; i < this.faceTexts.length; ++i) {
            const texture = null
            texture = await this.createTextTexture(i)
            /**
             * MeshPhongMaterial 一种用于具有镜面高光的 光泽 表面的材质。
             * MeshBasicMaterial 以简单着色（平面或线框）方式来绘制几何体的材质 不受光照的影响
             * 
             * 参数说明
             * map 颜色贴图 (纹理贴图颜色由漫反射颜色.color调节。)
             */
            materials.push(new THREE.MeshPhongMaterial(Object.assign({}, this.materialOptions, { map: texture })));
        }
        return materials;
    }

    getObject() {
        return this.object;
    }

    async create() {
        if (!DiceManager.world) throw new Error('You must call DiceManager.setWorld(world) first.');
        console.log(this.getGeometry())
        const Materials = await this.getMaterials()
        this.object = new THREE.Mesh(this.getGeometry(), Materials);
        // this.object = new THREE.Mesh(new THREE.BoxGeometry( 200, 200, 200 ), this.getMaterials());

        this.object.reveiceShadow = true;
        // 对象是否被渲染到阴影贴图中
        this.object.castShadow = false;
        this.object.diceObject = this;
        this.object.body = new CANNON.Body({
            mass: this.mass,
            shape: this.object.geometry.cannon_shape,
            // cannon的 材料属性：摩擦力、弹性等
            material: DiceManager.diceBodyMaterial
        });
        this.object.body.linearDamping = 0.1;
        this.object.body.angularDamping = 0.1;
        DiceManager.world.add(this.object.body);

        return this.object;
    }

    updateMeshFromBody() {
        if (!this.simulationRunning) {
            this.object.position.copy(this.object.body.position);
            this.object.quaternion.copy(this.object.body.quaternion);
        }
    }

    updateBodyFromMesh() {
        this.object.body.position.copy(this.object.position);
        this.object.body.quaternion.copy(this.object.quaternion);
    }

    resetBody() {
        if (this.object) {
            this.object.body.vlambda = new CANNON.Vec3();
            //this.object.body.collisionResponse = true;
            this.object.body.position = new CANNON.Vec3();
            this.object.body.previousPosition = new CANNON.Vec3();
            this.object.body.initPosition = new CANNON.Vec3();
            this.object.body.velocity = new CANNON.Vec3();
            this.object.body.initVelocity = new CANNON.Vec3();
            this.object.body.force = new CANNON.Vec3();
            //this.object.body.sleepState = 0;
            //this.object.body.timeLastSleepy = 0;
            //this.object.body._wakeUpAfterNarrowphase = false;
            this.object.body.torque = new CANNON.Vec3();
            this.object.body.quaternion = new CANNON.Quaternion();
            this.object.body.initQuaternion = new CANNON.Quaternion();
            this.object.body.angularVelocity = new CANNON.Vec3();
            this.object.body.initAngularVelocity = new CANNON.Vec3();
            this.object.body.interpolatedPosition = new CANNON.Vec3();
            this.object.body.interpolatedQuaternion = new CANNON.Quaternion();
            this.object.body.inertia = new CANNON.Vec3();
            this.object.body.invInertia = new CANNON.Vec3();
            this.object.body.invInertiaWorld = new CANNON.Mat3();
            //this.object.body.invMassSolve = 0;
            this.object.body.invInertiaSolve = new CANNON.Vec3();
            this.object.body.invInertiaWorldSolve = new CANNON.Mat3();
            //this.object.body.aabb = new CANNON.AABB();
            //this.object.body.aabbNeedsUpdate = true;
            this.object.body.wlambda = new CANNON.Vec3();

            this.object.body.updateMassProperties();

        }
    }

    updateMaterialsForValue(diceValue) { }
}
export class DiceD6 extends DiceObject {
    constructor(options) {
        super(options);
        (async () => {
            this.tab = -0.4;
            this.af = Math.PI / 4;
            this.chamfer = 0.9;
            // 立方体顶点坐标
            this.vertices = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
            this.faces = [[0, 3, 2, 1, 1], [1, 2, 6, 5, 2], [0, 1, 5, 4, 3], [3, 7, 6, 2, 4], [0, 4, 7, 3, 5], [4, 5, 6, 7, 6]];
            // 缩放系数
            this.scaleFactor = 1.5;
            this.values = 6;
            this.faceTexts = [' ', '0', '1', '2', '3', '4', '5', '6'];
            this.mass = 800; // 重量
            this.inertia = 13; // 惯性

            await this.create();
        })();
    }
}

//---------------------------------------------//

export const DiceManager = new DiceManagerClass();

if (typeof define === 'function' && define.amd) {
    define(function () {
        return {
            DiceManager: DiceManager,
            DiceD6: DiceD6,
        };
    });
} else if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = {
        DiceManager: DiceManager,
        DiceD6: DiceD6,
    };
} else {
    window.Dice = {
        DiceManager: DiceManager,
        DiceD6: DiceD6,
    };
}
/* eslint-disable */