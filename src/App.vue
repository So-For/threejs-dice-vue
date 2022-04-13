<template>
  <div
    class="dice-tool"
    ref="diceContainerRef"
    @mousedown.stop="close"
    @touchend.stop="close"
  >
    <div
      class="inner-box"
      ref="threeJSRef"
    ></div>
  </div>
</template>

<script lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-var-requires */
import { defineComponent, reactive, toRefs, ref, onMounted } from 'vue'
import * as CANNON from 'cannon'
import * as THREE from 'three'
// 骰子组件采用threejs-dice包
// threejs-dice npm版本为1.1.0(该版本依赖three.js 0.90.0, 代码运行时存在bug), GitHub最新版本为1.1.1(依赖three.js 0.131.0),暂时无法使用npm进行引入
const { DiceManager, DiceD6 } = require('./dice.js')
const { OrbitControls } = require('three/examples/jsm/controls/OrbitControls')

export default defineComponent({
  name: 'dice-tool',
  emits: ['close'],
  components: {},
  setup(_props, { emit }) {
    const dataRef: {
      show: boolean
    } = {
      show: true
    }
    const data = reactive(dataRef)

    const diceContainerRef = ref<HTMLElement>()
    const threeJSRef = ref<HTMLElement>()

    const init = async () => {
      if (!diceContainerRef.value || !threeJSRef.value) return
      // SCENE
      const scene = new THREE.Scene()
      // CAMERA
      const SCREEN_WIDTH = diceContainerRef.value.clientWidth,
        SCREEN_HEIGHT = diceContainerRef.value.clientHeight
      const VIEW_ANGLE = 45,
        ASPECT = SCREEN_WIDTH / SCREEN_HEIGHT,
        NEAR = 0.01,
        FAR = 20000
      const camera = new THREE.PerspectiveCamera(VIEW_ANGLE, ASPECT, NEAR, FAR)
      scene.add(camera)
      camera.position.set(0, 39, 39)

      // RENDERER (抗锯齿 开启alpha通道(允许透明))
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      // 设置背景透明
      renderer.setClearAlpha(0)
      renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT)

      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap

      threeJSRef.value.appendChild(renderer.domElement)

      // 轨道控制器(必须)
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.dispose()
      // 环境光
      const ambient = new THREE.AmbientLight('#ffffff', 0.3)
      scene.add(ambient)

      // 平行光
      const directionalLight = new THREE.DirectionalLight('#ffffff', 0.5)
      directionalLight.position.x = -1000
      directionalLight.position.y = 1000
      directionalLight.position.z = 1000
      scene.add(directionalLight)

      // 聚光灯
      const light = new THREE.SpotLight(0xefdfd5, 1.3)
      light.position.y = 100
      light.target.position.set(0, 0, 0)
      light.castShadow = true
      light.shadow.camera.near = 50
      light.shadow.camera.far = 110
      light.shadow.mapSize.width = 1024
      light.shadow.mapSize.height = 1024
      scene.add(light)

      // 地板
      // Phong网格材质(一种用于具有镜面高光的光泽表面的材质。)
      // const floorMaterial = new THREE.MeshPhongMaterial({
      //   color: 'transparent',
      //   side: THREE.DoubleSide
      // })
      // 地板平面(平面缓冲几何体)
      // const floorGeometry = new THREE.PlaneGeometry(30, 30, 10, 10)
      // const floor = new THREE.Mesh(floorGeometry, floorMaterial)
      // floor.receiveShadow = true
      // floor.rotation.x = Math.PI / 2
      // scene.add(floor)

      // SKYBOX/FOG

      // 立方缓冲几何体
      const skyBoxGeometry = new THREE.BoxGeometry(10000, 10000, 10000)

      // Phong网格材质(一种用于具有镜面高光的光泽表面的材质。)
      const skyBoxMaterial = new THREE.MeshPhongMaterial({
        color: '#FFFFFF',
        aoMapIntensity: 0
      })
      const skyBox = new THREE.Mesh(skyBoxGeometry, skyBoxMaterial)
      scene.add(skyBox)
      scene.fog = new THREE.FogExp2(0, 0)

      /**
       * CUSTOM
       */
      const world: any = new CANNON.World()

      world.gravity.set(0, -9.82 * 10, 0) // 重力属性
      world.broadphase = new CANNON.NaiveBroadphase()
      world.solver.iterations = 16

      DiceManager.setWorld(world)

      // Floor
      const floorBody = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Plane(),
        material: DiceManager.floorBodyMaterial
      })
      floorBody.quaternion.setFromAxisAngle(
        new CANNON.Vec3(1, 0, 0),
        -Math.PI / 2
      )
      world.add(floorBody)

      // Walls
      // 生成一个骰子
      const dice = await new DiceD6({ size: 4, backColor: '#ff0000' })

      setTimeout(() => {
        console.log(dice.object)
        scene.add(dice.getObject())
        function randomDiceThrow() {
          const diceValues = []

          dice.resetBody()
          // 投掷点坐标 x,y,z 均为0时,投掷点在canvas中心
          dice.getObject().position.x = -28
          dice.getObject().position.y = 2
          dice.getObject().position.z = -22
          dice.getObject().quaternion.x = 0
          dice.getObject().quaternion.z = 0
          dice.updateBodyFromMesh()
          const rand = Math.random() * 2

          // 初速度
          dice.getObject().body.velocity.set(31 + rand, 27 + rand, 25)

          // 速度角度(控制旋转)
          dice.getObject().body.angularVelocity.set(20, 15, 0)
          // 20 * Math.random() - 10,
          // 20 * Math.random() - 10,
          // 20 * Math.random() - 10

          // 骰子结果
          // const value = Math.ceil(Math.random() * 6) || 1
          const value = 6

          diceValues.push({ dice: dice, value })

          DiceManager.prepareValues(diceValues)
        }

        randomDiceThrow()

        requestAnimationFrame(animate)

        function animate() {
          updatePhysics()
          render()
          update()
          requestAnimationFrame(animate)
        }

        function updatePhysics() {
          world.step(1.0 / 60.0)
          dice.updateMeshFromBody()
        }

        function update() {
          controls.update()
        }

        function render() {
          renderer.render(scene, camera)
        }
      }, 500)
    }

    const close = () => {
      emit('close')
    }

    onMounted(() => {
      //
      init()
    })

    // const handleClickCanvas = (e: any) => {
    //   if (!threeJSRef.value) return
    //   const canvasDom = document.querySelector('canvas')
    //   if (!canvasDom) return
    //   const canvasInfo = canvasDom.getBoundingClientRect()
    //   console.log(ctx.isPointInPath(e.clientX - canvasInfo.left, e.clientY - canvasInfo.top))
    // }

    return {
      ...toRefs(data),
      diceContainerRef,
      threeJSRef,
      close
      // handleClickCanvas
    }
  }
})
</script>

<style scope>
.dice-tool {
  width: 100%;
  height: 100%;
  position: absolute;
  left: 0;
  top: 0;

  z-index: 999;
}
.inner-box {
  width: 100%;
  height: 100%;
  position: absolute;
  left: 0;
  top: 0;
}
</style>