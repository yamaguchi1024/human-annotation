window.URL = window.URL || window.webkitURL;
window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;

Number.prototype.format = function (){
  return this.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");
};

var editor = new Editor();

var viewport = new Viewport( editor );
document.body.appendChild( viewport.dom );

var sidebar = new Sidebar( editor );
document.body.appendChild( sidebar.dom );

var menubar = new Menubar( editor );
document.body.appendChild( menubar.dom );

//

editor.setTheme( editor.config.getKey( 'theme' ) );

editor.storage.init( function () {

  editor.storage.get( function ( state ) {

    if ( isLoadingFromHash ) return;

    if ( state !== undefined ) {

      editor.fromJSON( state );

    }

    var selected = editor.config.getKey( 'selected' );

    if ( selected !== undefined ) {

      editor.selectByUuid( selected );

    }

  } );

  //

  var timeout;

  function saveState( scene ) {

    if ( editor.config.getKey( 'autosave' ) === false ) {

      return;

    }

    clearTimeout( timeout );

    timeout = setTimeout( function () {

      editor.signals.savingStarted.dispatch();

      timeout = setTimeout( function () {

        editor.storage.set( editor.toJSON() );

        editor.signals.savingFinished.dispatch();

      }, 100 );

    }, 1000 );

  };

  var signals = editor.signals;

  signals.geometryChanged.add( saveState );
  signals.objectAdded.add( saveState );
  signals.objectChanged.add( saveState );
  signals.objectRemoved.add( saveState );
  signals.materialChanged.add( saveState );
  signals.sceneBackgroundChanged.add( saveState );
  signals.sceneFogChanged.add( saveState );
  signals.sceneGraphChanged.add( saveState );
  signals.scriptChanged.add( saveState );
  signals.historyChanged.add( saveState );

} );

//

document.addEventListener( 'dragover', function ( event ) {

  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';

}, false );

document.addEventListener( 'drop', function ( event ) {

  event.preventDefault();

  editor.loader.loadFiles( event.dataTransfer.files );

}, false );

function onWindowResize( event ) {

  editor.signals.windowResize.dispatch();

}

window.addEventListener( 'resize', onWindowResize, false );

onWindowResize();

//

var isLoadingFromHash = false;
var hash = window.location.hash;

if ( hash.substr( 1, 5 ) === 'file=' ) {

  var file = hash.substr( 6 );

  if ( confirm( 'Any unsaved data will be lost. Are you sure?' ) ) {

    var loader = new THREE.FileLoader();
    loader.crossOrigin = '';
    loader.load( file, function ( text ) {

      editor.clear();
      editor.fromJSON( JSON.parse( text ) );

    } );

    isLoadingFromHash = true;

  }

}

function changeImage(files) {
  editor.scene.remove(image);
  Array.from(files).forEach(file => {
    let reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function() {
      let result = reader.result;
      let image = new Image();

      image.crossOrigin = "anonymous";
      image.onload = function() {
        textureCanvas.width = image.width;
        textureCanvas.height = image.height;

        textureCanvas.getContext("2d").drawImage(image, 0, 0, image.width, image.height, 0, 0, textureCanvas.width, textureCanvas.height);
        loadTexture();
      }
      image.src = result;
    }
  });
}

let image;
let resolution = 50;
let texture;
function loadTexture() {
  // 画像のアレ
  let loader = new THREE.TextureLoader();
  texture = new THREE.Texture(textureCanvas);
  texture.needsUpdate = true;
  let imagegeometry = new THREE.PlaneBufferGeometry(textureCanvas.width/resolution, textureCanvas.height/resolution);
  let imagematerial = new THREE.MeshBasicMaterial( { map: texture } );
  image = new THREE.Mesh( imagegeometry, imagematerial );
  image.name = "画像";
  image.position.set(0, textureCanvas.height/resolution/2, 0);

  editor.scene.add(image);
}

function calcvertexdeform(mesh, vndx) {
  const bindMatrix = mesh.bindMatrix;
  const bindMatrixInverse = mesh.bindMatrixInverse;
  const geometry = new THREE.Geometry().fromBufferGeometry(mesh.geometry);;
  const vertices = geometry.vertices;
  const skeleton = mesh.skeleton;
  const position = new THREE.Vector3();
  const transformed = new THREE.Vector3();
  const temp1 = new THREE.Vector3();
  const tempBoneMatrix = new THREE.Matrix4();
  const tempSkinnedVertex = new THREE.Vector3();
  const tempSkinned = new THREE.Vector3();
  position.copy(vertices[vndx]);
  transformed.copy(position);

  tempSkinnedVertex.copy(transformed).applyMatrix4(bindMatrix);
  tempSkinned.set(0, 0, 0);

  const skinIndices = mesh.geometry.getAttribute('skinIndex').array;
  const skinWeights = mesh.geometry.getAttribute('skinWeight').array;
  //console.log(mesh.geometry.getAttribute('skinIndex').array);

  for (let i = 0; i < 4; ++i) {
    const boneNdx = skinIndices[vndx*4+i];
    const weight = skinWeights[vndx*4+i];
    tempBoneMatrix.fromArray(skeleton.boneMatrices, boneNdx * 16);
    temp1.copy(tempSkinnedVertex);
    tempSkinned.add(temp1.applyMatrix4(tempBoneMatrix).multiplyScalar(weight));
  }

  transformed.copy(tempSkinned).applyMatrix4(bindMatrixInverse);

  return transformed;
}

let meshes = [];
function downloadTexture() {
  // Project to plane
  let image_data = textureContext.getImageData(0, 0, textureCanvas.width, textureCanvas.height);
  let planewidth = textureCanvas.width/resolution;
  let planeheight = textureCanvas.height/resolution;

  let curCanvas = document.createElement('canvas');
  let curContext = curCanvas.getContext('2d');
  curCanvas.height = textureCanvas.height; curCanvas.width = textureCanvas.width;
  curContext.drawImage(textureCanvas, 0, 0);

  for (mesh of meshes) {
    const bindMatrix = mesh.bindMatrix;
    const geometry = new THREE.Geometry().fromBufferGeometry(mesh.geometry);;
    const vertices = geometry.vertices;

    for (let vndx = 0; vndx < vertices.length; ++vndx) {
      let vec;
      if (bindMatrix == undefined) vec = vertices[vndx];
      else vec = calcvertexdeform(mesh, vndx);

      vec.applyMatrix4(mesh.matrixWorld);

      if (isNaN(vec.x)) continue;

      let x = (vec.x + planewidth/2)/planewidth;
      let y = ((planeheight - vec.y)/planeheight);
      let px = Math.floor(x*curCanvas.width);
      let py = Math.floor(y*curCanvas.height);

      if (vndx == 0) {
        curContext.moveTo(px, py);
        continue;
      }
      curContext.lineTo(px, py);
      curContext.stroke();
      curContext.moveTo(px, py);
      //const index = (px + py * curCanvas.width)*4;
      //drawPixel(image_data, index, 255, 0, 0, 255);
    }
  }

  //curContext.putImageData(image_data, 0, 0);
  let url = curCanvas.toDataURL();
  window.open(url);
}

function drawPixel (image_data, index, r, g, b, a) {
  image_data.data[index + 0] = r;
  image_data.data[index + 1] = g;
  image_data.data[index + 2] = b;
  image_data.data[index + 3] = a;
}

function addSkeleton () {
  // For legs
  var legsegmentCount = 2;
  var legheight = 2;
  var legsizing = {
    segmentHeight: legheight/legsegmentCount,
    segmentCount: legsegmentCount,
    height: legheight,
    halfHeight: legheight * 0.5
  };

  let legkansetu = ["足首", "ひざ", "足の付け根"];
  let leftleg = initBones(legsizing, "左足", legkansetu);
  leftleg.position.set(0.438, 1.3, 0);

  let rightleg = initBones(legsizing, "右足", legkansetu);
  rightleg.position.set(-0.438, 1.3, 0);

  // For torso
  var torsosegmentCount = 3;
  var torsoheight = 2;
  var torsosizing = {
    segmentHeight: torsoheight/torsosegmentCount,
    segmentCount: torsosegmentCount,
    height: torsoheight,
    halfHeight: torsoheight * 0.5
  };

  let koshikansetu = ["腰", "背骨1", "背骨2", "首"];
  let torso = initBones(torsosizing, "胴体", koshikansetu);
  torso.position.set(0, 3.233, 0);
  torso.scale.set(3, 1, 1);

  // For arms
  var armsegmentCount = 2;
  var armheight = 2;
  var armsizing = {
    segmentHeight: armheight/armsegmentCount,
    segmentCount: armsegmentCount,
    height: armheight,
    halfHeight: armheight * 0.5
  };
  let armkansetu = ["手首", "ひじ", "腕の付け根"];
  let leftarm = initBones(armsizing, "左腕", armkansetu);
  leftarm.position.set(-1.3, 3.8, 0);
  leftarm.rotation.set(0, 0, -20);

  let rightarm = initBones(armsizing, "右腕", armkansetu);
  rightarm.position.set(1.3, 3.8, 0);
  rightarm.rotation.set(0, 0, 20);

  let headgeometry = new THREE.SphereBufferGeometry(1, 20, 20);
  let headmaterial = new THREE.MeshPhongMaterial( {
    color: 0x156289,
    emissive: 0x072534,
    side: THREE.DoubleSide,
    flatShading: true
  } );
  let head = new THREE.Mesh(headgeometry, headmaterial);
  head.scale.set(0.8, 0.8, 0.8);
  head.position.set(0, 5.0, 0);
  head.name = "頭";

  meshes.push(leftleg);
  meshes.push(rightleg);
  meshes.push(torso);
  meshes.push(leftarm);
  meshes.push(rightarm);
  meshes.push(head);

  const wrap = new THREE.Object3D();
  wrap.name = "人体";
  for (mesh of meshes) {
    wrap.add(mesh);
  }
  editor.addObject(wrap);
}

let textureCanvas, textureContext;
// HERE!!
{
  textureCanvas = document.createElement( "canvas" );
  textureContext = textureCanvas.getContext( "2d" );
}

function createGeometry(sizing, geomname) {

  var geometry = new THREE.CylinderBufferGeometry(
    0.2, // radiusTop
    0.2, // radiusBottom
    sizing.height, // height
    8, // radiusSegments
    sizing.segmentCount * 3, // heightSegments
    true // openEnded
  );
  geometry.name = geomname;

  var position = geometry.attributes.position;

  var vertex = new THREE.Vector3();

  var skinIndices = [];
  var skinWeights = [];

  for ( var i = 0; i < position.count; i ++ ) {

    vertex.fromBufferAttribute( position, i );

    var y = ( vertex.y + sizing.halfHeight );

    var skinIndex = Math.floor( y / sizing.segmentHeight );
    var skinWeight = ( y % sizing.segmentHeight ) / sizing.segmentHeight;

    skinIndices.push( skinIndex, skinIndex + 1, 0, 0 );
    skinWeights.push( 1 - skinWeight, skinWeight, 0, 0 );

  }

  geometry.addAttribute( 'skinIndex', new THREE.Uint16BufferAttribute( skinIndices, 4 ) );
  geometry.addAttribute( 'skinWeight', new THREE.Float32BufferAttribute( skinWeights, 4 ) );

  return geometry;

}

function createBones( sizing , kansetu) {

  bones = [];

  var prevBone = new THREE.Bone();
  prevBone.name = kansetu[0];
  bones.push( prevBone );
  prevBone.position.y = - sizing.halfHeight;

  for ( var i = 0; i < sizing.segmentCount; i ++ ) {

    var bone = new THREE.Bone();
    if (i < kansetu.length - 1)
      bone.name = kansetu[i+1];

    bone.position.y = sizing.segmentHeight;
    bones.push( bone );
    prevBone.add( bone );
    prevBone = bone;
  }

  return bones;
}

function createMesh( geometry, bones ) {

  var material = new THREE.MeshPhongMaterial( {
    skinning: true,
    color: 0x156289,
    emissive: 0x072534,
    side: THREE.DoubleSide,
    flatShading: true
  } );

  var mesh = new THREE.SkinnedMesh( geometry,	material );
  var skeleton = new THREE.Skeleton( bones );

  mesh.add( bones[ 0 ] );

  mesh.bind( skeleton );

  skeletonHelper = new THREE.SkeletonHelper( mesh );
  skeletonHelper.material.linewidth = 2;
  //editor.scene.add( skeletonHelper );

  return mesh;

}

function initBones(sizing, geomname, kansetu) {
  var geometry = createGeometry(sizing, geomname);
  var bones = createBones(sizing, kansetu);
  mesh = createMesh( geometry, bones );

  mesh.scale.multiplyScalar( 1 );
  return mesh;
}
