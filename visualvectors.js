var container, stats;
var camera, scene, raycaster, renderer, parentTransform, sphereInter;

var mouse = new THREE.Vector2();
var radius = 100;

var currentIntersected;

var clock = new THREE.Clock();
var dt;

var TRANSITION_SPEED = 2;

var dragging = false;
var drag_object, drag_object_type, drag_object_offset, drag_object_handle;
drag_object_offset = new THREE.Vector3();
drag_object_handle = new THREE.Vector3();

var grid_fade = 0;
var grid;
var grid_strong;

var pages;
var current_page;
var init_vectors;
var run_vectors = {};
var raycast_objects = [];

function visualvectors_init()
{
	pages = [
		{
			vectors: [
				VVector({name: "green", color: 0x0D690F, v0: VVector3v(-1, 0, 0), v1: VVector3v(1, 1, 0),
					length: true,
					angle: true
				}),
			]
		},
		{
			vectors: [
				VVector({name: "green", color: 0x0D690F, v0: VVector3v(0, 0, 0), v1: VVector3v(1, 1, 0)}),
			]
		},
		{
			vectors: [
				VVector({name: "green", color: 0x0D690F, v0: VVector3v(0, 0, 0), v1: VVector3v(0, -4, 0)}),
				VVector({name: "red", color: 0x690D0D, v0: VVector3v(0, 1, 0), v1: VVector3v(1, 1, 0)})
			]
		},
		{
			vectors: [
				VVector({name: "green", color: 0x0D690F, v0: VVector3v(-1, 1, 0), v1: VVector3v(0, 0, 0)}),
				VVector({name: "blue", color: 0x0D0D69, v0: VVector3v(0, 0, 0), v1: VVector3v(-1, -1, 0)})
			]
		}
	];
	init();
	animate();
}

function arrangeVVector(k)
{
	var v = run_vectors[k];
	v.vector.position.copy(v.v0);
	v.vector_head.position.copy(v.v1);
	v.vector_handle.position.copy(v.v0);
	v.vector_base.position.copy(v.v0);
	v.vector_head_handle.position.copy(v.v1);

	var direction = new THREE.Vector3();
	direction.copy(v.v1);
	direction.sub(v.v0);
	var vector_length = direction.length();
	direction.normalize();

	v.vector.scale.setX(vector_length - 0.25);
	v.vector.quaternion.setFromUnitVectors(
		new THREE.Vector3(1, 0, 0),
		direction
	);

	v.vector_head.quaternion.setFromUnitVectors(
		new THREE.Vector3(1, 0, 0),
		direction
	);

	v.vector_head_handle.quaternion.setFromUnitVectors(
		new THREE.Vector3(1, 0, 0),
		direction
	);

	v.vector_handle.scale.setX(vector_length - 0.25);
	v.vector_handle.quaternion.setFromUnitVectors(
		new THREE.Vector3(1, 0, 0),
		direction
	);
}

var vector_geometry;
var handle_geometry;
var vector_handle_geometry;
var head_geometry;
var handle_material;

var length_text_attr = {
	size: 60,
	height: 0,
	curveSegments: 3,
	font: 'droid sans',
	weight: 'normal',
	bevelEnabled: false
};

function array_swap_pop(array, index)
{
	array[index] = array[array.length-1];
	array.pop();
}

function remove_raycast_object(object)
{
	for (var k = 0; k < raycast_objects.length; k++)
	{
		if (object == raycast_objects[k])
		{
			array_swap_pop(raycast_objects, k);
			return;
		}
	}

	console.error("Couldn't find raycast object " + object.name + " to remove");
}

function page_setup(page)
{
	current_page = page;

	init_vectors = pages[page].vectors;

	for (var name in run_vectors)
	{
		if (!run_vectors[name].kill)
		{
			remove_raycast_object(run_vectors[name].vector_handle);
			remove_raycast_object(run_vectors[name].vector_head_handle);
			remove_raycast_object(run_vectors[name].vector_base);
		}
		run_vectors[name].kill = true;

		if (run_vectors[name].length_label)
		{
			parentTransform.remove(run_vectors[name].length_label);
			run_vectors[name].length_label = null;
		}
	}

	for ( var i = 0; i < init_vectors.length; i ++ )
	{
		var vname = init_vectors[i].name;

		if (vname in run_vectors)
		{
			run_vectors[vname].transitions = [];

			{
				var d0 = TV3_Distance(run_vectors[vname].v0, run_vectors[vname].v1);
				var d1 = TV3_Distance(init_vectors[i].v0, init_vectors[i].v1);
				if (Math.abs(d0 - d1) > 0.00001)
					run_vectors[vname].transitions.push(VTransition("length", d0, d1,
						clock.getElapsedTime(), clock.getElapsedTime()+1/TRANSITION_SPEED
						));
			}
			{
				var v0 = TV3_Center(run_vectors[vname].v0, run_vectors[vname].v1);
				var v1 = TV3_Center(init_vectors[i].v0, init_vectors[i].v1);
				if (VVector3(v0).sub(v1).length() > 0.00001)
					run_vectors[vname].transitions.push(VTransition("center", v0, v1,
						clock.getElapsedTime(), clock.getElapsedTime()+1/TRANSITION_SPEED
						));
			}
			{
				var q0 = TV3_Direction(run_vectors[vname].v0, run_vectors[vname].v1);
				var q1 = TV3_Direction(init_vectors[i].v0, init_vectors[i].v1);
				var v0 = VVector3v(1, 0, 0).applyQuaternion(q0);
				var v1 = VVector3v(1, 0, 0).applyQuaternion(q1);
				if (v0.dot(v1) < 0.9999)
					run_vectors[vname].transitions.push(VTransition("direction", q0, q1,
						clock.getElapsedTime(), clock.getElapsedTime()+1/TRANSITION_SPEED
						));
			}
		}
		else
		{
			var arrow_material = new THREE.MeshBasicMaterial( { color: init_vectors[i].color } );

			var vector = new THREE.Mesh( vector_geometry, arrow_material );
			var vector_handle = new THREE.Mesh( vector_handle_geometry, handle_material );
			var vector_head = new THREE.Mesh( head_geometry, arrow_material );
			var vector_head_handle = new THREE.Mesh( head_handle_geometry, handle_material );
			var vector_base = new THREE.Mesh( handle_geometry, handle_material );

			vector.userData.vid = i;
			vector.userData.vname = vname;
			vector.userData.meshtype = "body";
			vector_handle.userData.vid = i;
			vector_handle.userData.vname = vname;
			vector_handle.userData.meshtype = "body";
			vector_head.userData.vid = i;
			vector_head.userData.vname = vname;
			vector_head.userData.meshtype = "head";
			vector_head_handle.userData.vid = i;
			vector_head_handle.userData.vname = vname;
			vector_head_handle.userData.meshtype = "head";
			vector_base.userData.vid = i;
			vector_base.userData.vname = vname;
			vector_base.userData.meshtype = "base";

			parentTransform.add( vector );
			parentTransform.add( vector_handle );
			parentTransform.add( vector_head );
			parentTransform.add( vector_head_handle );
			parentTransform.add( vector_base );

			run_vectors[vname] = {};
			run_vectors[vname].transitions = [];
			run_vectors[vname].vector = vector;
			run_vectors[vname].vector_head = vector_head;
			run_vectors[vname].vector_handle = vector_handle;
			run_vectors[vname].vector_head_handle = vector_head_handle;
			run_vectors[vname].vector_base = vector_base;

			run_vectors[vname].vector.material.transparent = true;
			run_vectors[vname].vector.material.opacity = 0;

		}

		if ("length" in init_vectors[i])
		{
			var text_material = new THREE.MeshBasicMaterial( { color: 0x0 } );
			var text_geometry = new THREE.TextGeometry("Length", length_text_attr);

			text_geometry.computeBoundingBox();

			var scale = 0.005;

			run_vectors[vname].length_label = new THREE.Mesh( text_geometry, text_material );
			run_vectors[vname].length_label.scale.copy(VVector3v(scale, scale, scale));
			parentTransform.add(run_vectors[vname].length_label);

			run_vectors[vname].length_label.text_size = (text_geometry.boundingBox.max.x - text_geometry.boundingBox.min.x) * run_vectors[vname].length_label.scale.x;
		}

		run_vectors[vname].v0 = VVector3(init_vectors[i].v0);
		run_vectors[vname].v1 = VVector3(init_vectors[i].v1);

		run_vectors[vname].kill = false;

		raycast_objects.push(run_vectors[vname].vector_handle);
		raycast_objects.push(run_vectors[vname].vector_base);
		raycast_objects.push(run_vectors[vname].vector_head_handle);

		arrangeVVector(init_vectors[i].name);
	}
}

function page_retreat()
{
	if (current_page - 1 < 0)
		return;

	page_setup(current_page-1);
}

function page_advance()
{
	if (current_page + 1 >= pages.length)
		return;

	page_setup(current_page+1);
}

function init() {
	container = document.createElement( 'div' );
	document.body.appendChild( container );

	var info = document.createElement( 'div' );
	info.style.position = 'absolute';
	info.style.top = '10px';
	info.style.width = '100%';
	info.style.textAlign = 'center';
	//info.innerHTML = '<a href="http://threejs.org" target="_blank">three.js</a> webgl - interactive lines';
	container.appendChild( info );

	var width = window.innerWidth;
	var height = window.innerHeight;
	var ratio = height/width;
	var size = 10;
	//camera = new THREE.OrthographicCamera( -size, size, size*ratio, -size*ratio, -1, 10000 );
	camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 10000 );

	scene = new THREE.Scene();

	var GRID_MAX = 5;

	var grid_geometry = new THREE.Geometry();

	for (var k = -GRID_MAX+1; k < GRID_MAX; k++)
	{
		if (k == 0)
			continue;

		grid_geometry.vertices.push(
			new THREE.Vector3( k, -GRID_MAX, 0 ),
			new THREE.Vector3( k, GRID_MAX, 0 ),
			new THREE.Vector3( -GRID_MAX, k, 0 ),
			new THREE.Vector3( GRID_MAX, k, 0 )
		);
	}

	var grid_material = new THREE.MeshBasicMaterial( { color: 0xe6d5c1 } );
	grid = new THREE.LineSegments(grid_geometry, grid_material);
	scene.add(grid);

	var grid_strong_geometry = new THREE.Geometry();

	grid_strong_geometry.vertices.push(
		new THREE.Vector3( -5, -5, 0 ),
		new THREE.Vector3( -5, 5, 0 ),
		new THREE.Vector3( 5, -5, 0 ),
		new THREE.Vector3( 5, 5, 0 ),
		new THREE.Vector3( -5, -5, 0 ),
		new THREE.Vector3( 5, -5, 0 ),
		new THREE.Vector3( -5, 5, 0 ),
		new THREE.Vector3( 5, 5, 0 ),
		new THREE.Vector3( 0, -5, 0 ),
		new THREE.Vector3( 0, 5, 0 ),
		new THREE.Vector3( -5, 0, 0 ),
		new THREE.Vector3( 5, 0, 0 )
	);

	var grid_strong_material = new THREE.MeshBasicMaterial( { color: 0xc3b5a5 } );
	grid_strong = new THREE.LineSegments(grid_strong_geometry, grid_strong_material);
	scene.add(grid_strong);

	var geometry = new THREE.SphereGeometry( 0.1, 16, 12 );
	var background_material = new THREE.MeshBasicMaterial( { color: 0xff0000 } );

	sphereInter = new THREE.Mesh( geometry, background_material );
	sphereInter.visible = false;
	scene.add( sphereInter );

	var point = new THREE.Vector3();
	var direction = new THREE.Vector3();

	var geometry = new THREE.Geometry( );
	geometry.vertices.push(new THREE.Vector3(0, 0, 0));
	geometry.vertices.push(new THREE.Vector3(1, 0, 0));

	parentTransform = new THREE.Object3D();

	vector_geometry = new THREE.CylinderGeometry(.03, .03, 1, 16);
	vector_geometry.applyMatrix( new THREE.Matrix4().makeRotationZ( THREE.Math.degToRad( 90 ) ) );
	vector_geometry.translate(0.5, 0, 0);

	handle_geometry = new THREE.SphereGeometry(.15, 4, 4);
	head_handle_geometry = new THREE.SphereGeometry(.15, 4, 4);
	head_handle_geometry.translate(-0.15, 0, 0);

	vector_handle_geometry = new THREE.CylinderGeometry(.08, .08, 1, 16);
	vector_handle_geometry.applyMatrix( new THREE.Matrix4().makeRotationZ( THREE.Math.degToRad( 90 ) ) );
	vector_handle_geometry.translate(0.5, 0, 0);

	head_geometry = new THREE.CylinderGeometry(.08, 0, 0.25, 16);
	head_geometry.applyMatrix( new THREE.Matrix4().makeRotationZ( THREE.Math.degToRad( 90 ) ) );
	head_geometry.translate(-0.125, 0, 0);

	handle_material = new THREE.MeshBasicMaterial();
	handle_material.visible = false;

	page_setup(0);

	scene.add( parentTransform );

	raycaster = new THREE.Raycaster();
	raycaster.linePrecision = 3;

	renderer = new THREE.WebGLRenderer( { antialias: true } );
	renderer.setClearColor( 0xF0E9E1 );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	container.appendChild(renderer.domElement);

	stats = new Stats();
	stats.domElement.style.position = 'absolute';
	stats.domElement.style.top = '0px';
	container.appendChild( stats.domElement );

	document.addEventListener( 'mousemove', onDocumentMouseMove, false );
	document.addEventListener( 'mousedown', onDocumentMouseDown, false );
	document.addEventListener( 'mouseup', onDocumentMouseUp, false );
	document.addEventListener( 'keydown', onDocumentKeyDown, false );

	window.addEventListener( 'resize', onWindowResize, false );
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );
}

function onDocumentMouseMove( event ) {
	event.preventDefault();

	mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;

	if (dragging)
	{
		var original_screen_position = toScreenPosition(drag_object_handle, camera);
		var screen_position = new THREE.Vector3(event.clientX, event.clientY, original_screen_position.z);
		var world_position = fromScreenPosition(screen_position, camera)
		world_position.sub(drag_object_offset);

		if (drag_object_type == "body")
		{
			var difference = VVector3(world_position);
			difference.sub(run_vectors[drag_object].v0);
			run_vectors[drag_object].v0 = world_position;
			run_vectors[drag_object].v1.add(difference);
		}
		else if (drag_object_type == "head")
			run_vectors[drag_object].v1 = world_position;
		else if (drag_object_type == "base")
			run_vectors[drag_object].v0 = world_position;

		arrangeVVector(drag_object);
	}
}

function onDocumentMouseDown( event ) {
	event.preventDefault();

	raycaster.setFromCamera( mouse, camera );

	var intersects = raycaster.intersectObjects( raycast_objects, true);

	if (!intersects.length)
		return;

	dragging = true;
	drag_object = intersects[0].object.userData.vname;
	drag_object_type = intersects[0].object.userData.meshtype;
	drag_object_handle.copy(intersects[0].point);
	drag_object_offset.copy(drag_object_handle);
	drag_object_offset.sub(intersects[0].object.position);
}

function onDocumentMouseUp( event ) {
	event.preventDefault();

	raycaster.setFromCamera( mouse, camera );

	dragging = false;
}

function onDocumentKeyDown( event ) {
	switch (event.keyCode)
	{
	case 13: // enter
	case 32: // space bar
	case 34: // page down
	case 39: // right arrow
	case 40: // down arrow
		event.preventDefault();

		page_advance();
		break;

	case 33: // page up
	case 37: // left arrow
	case 38: // up arrow
		event.preventDefault();

		page_retreat();
		break;

	default:
	}
}

function animate() {
	requestAnimationFrame( animate );

	render();
	stats.update();
}

function vector_transition(vector, transition, lerp)
{
	if (transition.type == "length")
	{
		var new_length = RemapVal(lerp, 0, 1, transition.start_value, transition.end_value);

		var v = VVector3(vector.v1);
		v.sub(vector.v0);

		var center = VVector3(v);
		center.multiplyScalar(0.5);
		center.add(vector.v0);

		v.normalize();
		v.multiplyScalar(new_length);

		var new_v0 = VVector3(v);
		new_v0.multiplyScalar(-0.5);
		new_v0.add(center);

		var new_v1 = VVector3(v);
		new_v1.multiplyScalar(0.5);
		new_v1.add(center);

		vector.v0 = new_v0;
		vector.v1 = new_v1;
	}
	else if (transition.type == "center")
	{
		var center_path = VVector3(transition.end_value);
		center_path.sub(transition.start_value);
		center_path.multiplyScalar(lerp);
		center_path.add(transition.start_value);

		var v = VVector3(vector.v1);
		v.sub(vector.v0);

		var new_v0 = VVector3(v);
		new_v0.multiplyScalar(-0.5);
		new_v0.add(center_path);

		var new_v1 = VVector3(v);
		new_v1.multiplyScalar(0.5);
		new_v1.add(center_path);

		vector.v0 = new_v0;
		vector.v1 = new_v1;
	}
	else if (transition.type == "direction")
	{
		var new_direction = new THREE.Quaternion();
		THREE.Quaternion.slerp(transition.start_value, transition.end_value, new_direction, lerp);

		var center = TV3_Center(vector.v0, vector.v1);
		var length = TV3_Distance(vector.v0, vector.v1);

		var new_v = VVector3v(1, 0, 0);
		new_v.applyQuaternion(new_direction);
		new_v.multiplyScalar(length/2);

		vector.v0 = VVector3(new_v);
		vector.v0.multiplyScalar(-1);
		vector.v0.add(center);

		vector.v1 = VVector3(new_v);
		vector.v1.add(center);
	}
	else
	{
		console.error("Unknown transition type");
	}
}

function render() {
	dt = clock.getDelta();

	camera.position.x = 0;
	camera.position.y = 0;
	camera.position.z = 10;
	camera.lookAt( new THREE.Vector3(0, 0, 0) );

	camera.updateMatrixWorld();

	// find intersections

	raycaster.setFromCamera( mouse, camera );

	var intersects = raycaster.intersectObjects( raycast_objects, true);

	if ( intersects.length > 0 ) {
		currentIntersected = intersects[ 0 ].object;

		sphereInter.visible = true;
		sphereInter.position.copy( intersects[ 0 ].point );
	} else {
		currentIntersected = undefined;

		sphereInter.visible = false;
	}

	// Handle animations
	for (var k in run_vectors)
	{
		var vector = run_vectors[k];

		if (vector.length_label != null)
		{
			var scale = VVector3v(1, -0.1, 0).multiplyScalar(vector.length_label.text_size + 2);
			vector.length_label.position.copy(
				VVector3(vector.v1)
					.sub(VVector3(vector.v0))
					.multiplyScalar(0.5)
					.add(vector.v0)
					.sub(scale)
			);

			var new_length = VVector3(vector.v1).sub(vector.v0).length();

			if (vector.old_length == null || vector.old_length != new_length)
				vector.length_label.geometry = new THREE.TextGeometry("length: " + new_length.toFixed(2), length_text_attr);
		}
		vector.old_length = VVector3(vector.v1).sub(vector.v0).length();

		if (vector.kill)
		{
			vector.vector.material.transparent = true;
			vector.vector.material.opacity -= TRANSITION_SPEED*dt;

			if (vector.vector.material.opacity <= 0)
			{
				parentTransform.remove(vector.vector);
				parentTransform.remove(vector.vector_head);
				parentTransform.remove(vector.vector_head_handle);
				parentTransform.remove(vector.vector_handle);
				parentTransform.remove(vector.vector_base);

				delete run_vectors[k]; // TODO: Can I do this in a loop over run_vectors?
				continue;
			}
		}
		else
		{
			if (vector.vector.material.transparent)
			{
				vector.vector.material.opacity += TRANSITION_SPEED*dt;
				if (vector.vector.material.opacity >= 1)
					vector.vector.material.transparent = false;
			}
		}

		var arrange = false;

		for (var j = 0; j < vector.transitions.length; j++)
		{
			var transition = vector.transitions[j];
			var lerp = RemapVal(clock.getElapsedTime(), transition.start_time, transition.end_time, 0, 1);

			if (lerp >= 1)
			{
				arrange = true;
				vector_transition(vector, transition, 1);
				array_swap_pop(vector.transitions, j);
				j--;
				continue;
			}

			vector_transition(vector, transition, lerp);
			arrange = true;
		}

		if (arrange)
			arrangeVVector(k);
	}

	if (grid_fade < 1)
	{
		grid_fade += dt;
		grid.material.opacity = grid_strong.material.opacity = grid_fade;
		grid.material.transparent = grid_strong.material.transparent = true;
	}
	else
	{
		grid_fade = 1;
		grid.material.opacity = grid_strong.material.opacity = grid_fade;
		grid.material.transparent = grid_strong.material.transparent = false;
	}

	renderer.render( scene, camera );
}

