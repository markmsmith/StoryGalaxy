// adds support to THREE.Ray for testing itersection with a particle system
(function(){

	// upgrade this from private
	var v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
	THREE.Ray.prototype.distanceFromIntersection = function ( origin, direction, position ) {

		v0.sub( position, origin );
		dot = v0.dot( direction );

		intersect = v1.add( origin, v2.copy( direction ).multiplyScalar( dot ) );
		distance = position.distanceTo( intersect );

		return distance;

	};

	THREE.Ray.prototype.intersectParticleSystem = function ( object, intersects ) {

		var vertices = object.geometry.vertices;
		var point, distance, intersect;

		for ( var i = 0; i < vertices.length; i ++ ) {

			point = vertices[ i ];
			distance = this.distanceFromIntersection(
				this.origin,
				this.direction,
				object.matrixWorld.multiplyVector3( point.clone() )
			);

			if ( distance > this.threshold ) {
				continue;
			}

			intersect = {

				distance: distance,
				//point: point.clone(),
				// skipping the defensive clone to pass along the story
				point: point,
				face: null,
				object: object,
				vertex: i
			};

			intersects.push( intersect );
		}
	};

	var oldInteresectObject = THREE.Ray.intersectObject;
	THREE.Ray.prototype.intersectObject = function(object, recursive){
		if ( object instanceof THREE.ParticleSystem ) {
			var intersects = [];
			this.intersectParticleSystem(object, intersects);
			return intersects;
		}
		else{
			return oldInteresectObject.appy(this, arguments);
		}
	}

	// necessary due to the way the intersectObject function was originally defined
	THREE.Ray.prototype.monkeyPatch = function(){
		this.intersectObject = THREE.Ray.prototype.intersectObject;
	}
	
}());
