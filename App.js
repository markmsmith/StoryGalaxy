Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    layout: {
        type: 'vbox'
    },
    items:[
        {
            xtype: 'component',
            itemId: 'holder',
            autoEl: 'canvas',
            width: 800,
            height: 600,
            margin: '0 0 200 0'
        },
        {
            xtype: 'form',
            width: 800,
            defaultType: 'textfield',
            defaults:{
                width: 700
            },
            items: [
                {
                    itemId: 'formattedID',
                    fieldLabel: 'FormattedID'
                },
                {
                    itemId: 'name',
                    fieldLabel: 'Name'
                },
                {
                    itemId: 'kanbanState',
                    fieldLabel: 'KanbanState'
                },
                {
                    itemId: 'validFrom',
                    fieldLabel: 'Valid From'
                },
                {
                    itemId: 'validTo',
                    fieldLabel: 'Valid To'
                }
            ]
        }
    ],

    launch: function() {
        var workspaceOID = this.getContext().getWorkspace().ObjectID;
        var projectOID = this.getContext().getProject().ObjectID;

        //TODO remove this and use the standard store when the new Lookback API url format is online
        Ext.define('Rally.data.lookback.SnapshotStoreOldUrl', {
            extend: 'Rally.data.lookback.SnapshotStore',

            constructor: function(config) {
                this.callParent([config]);
                // temporary override needed since new URL format not deployed yet
                this.proxy.url = Rally.environment.getServer().getLookbackUrl(1.37) + '/' +
                        Rally.util.Ref.getOidFromRef(this.context.workspace) + '/artifact/snapshot/query';
            }
        });


        this.snapshotStore = Ext.create('Rally.data.lookback.SnapshotStoreOldUrl', {
                autoLoad: true,
                context: {
                    workspace: ('/workspace/'+ workspaceOID),
                    project: ('/project/'+ projectOID)
                },
                sorters: [
                    {
                        property: '_ValidTo',
                        direction: 'DESC'
                    },
                    {
                        property: 'ObjectID',
                        direction: 'ASC'
                    }
                ],
                hydrate: ['KanbanState'],
                fetch: ['ObjectID', '_UnformattedID', 'Name', 'KanbanState', '_ValidFrom', '_ValidTo'],

                // look for snapshots of stories in the current project
                filters: [
                    { property: 'Project', value: projectOID },
                    { property: '_Type', value: 'HierarchicalRequirement' }
                ],
                pageSize: 20000,
                limit: 20000,

                listeners: {
                    load: this.onStoreLoad,
                    scope: this
                }
        });
    },

    onStoreLoad: function(store, records){
        console.log('Got '+ records.length +' records');
    
        if ( ! Detector.webgl ){
            Detector.addGetWebGLMessage();
        }

        // get the DOM element to attach to
        var holder = this.down('#holder');
        var width = holder.getWidth();
        var height = holder.getHeight();
        var holderEl = holder.getEl().dom;

        // create a renderer with antialiasing on
        this.glRenderer = new THREE.WebGLRenderer({
            canvas: holderEl,
            antialias: true
        });

        this.glRenderer.setSize(width, height);
        this.glRenderer.setClearColorHex(0xEFEFEF, 1.0);
        
        this.glRenderer.clear();
        
        this.scene = new THREE.Scene();
        //this.scene.fog = new THREE.FogExp2( 0x333333, 0.0009 );

        // set some camera attributes
        var viewAngle = 45;
        var aspectRatio = width / height;
        var nearPlane = 1;
        var farPlane = 20000;
        this.camera = new THREE.PerspectiveCamera(viewAngle, aspectRatio, nearPlane, farPlane);


        //TODO handle if there's less than 2 records

        var firstSnapshot = store.first();
        var firstDate = new Date(firstSnapshot.data["_ValidFrom"]);
        var lastSnapshot = store.last();
        var dayRange = firstDate - new Date(lastSnapshot.data["_ValidFrom"]);
        // convert from ms to days
        dayRange = dayRange / 1000 / 60 / 60 / 24;
        

        // the camera starts at 0,0,0 so pull it back
        this.cameraDistance = 1400;
        this.camera.position.z = this.cameraDistance;
        this.scene.add(this.camera);

        var sprite = THREE.ImageUtils.loadTexture( "./textures/sprites/ball.png" );

        var geometry = new THREE.Geometry();
        var colors = [];
        for(var i = 0, rl = records.length; i < rl; ++i){
            var record = records[i].data;

            var vertex = new THREE.Vector3();
            vertex.x = 2000 * Math.random() - 1000;
            vertex.y = 2000 * Math.random() - 1000;
            //vertex.z = i / 500 * 100;
            vertex.z = this.getDaysSinceFirst(record, firstDate) / dayRange * farPlane;

            // tack on the record
            vertex.story = record;

            geometry.vertices.push(vertex);

            colors[i] = new THREE.Color(0xffffff);
            var hue = (vertex.x + 1000) / 2000;
            colors[i].setHSV(hue, 1, 1);
        }

        geometry.colors = colors;

        this.material = new THREE.ParticleBasicMaterial( { size: 85, map: sprite, vertexColors: true } );
        this.material.color.setHSV( 1.0, 0.2, 0.8 );

        this.particles = new THREE.ParticleSystem(geometry, this.material);
        this.particles.sortParticles = true;
        this.scene.add(this.particles);

        // var lineMaterial = new THREE.LineBasicMaterial({
        //     lineThickness: 5,
        //     vertexColors: true
        // });
        // var lines = new THREE.Line(THREE.GeometryUtils.clone(geometry), lineMaterial, THREE.LinePieces);
        // this.scene.add(lines);

        // make the camera controllable with the mouse
        this.mouseControls = new THREE.TrackballControls(this.camera, this.glRenderer.domElement);

        // draw the scene
        this.glRenderer.render(this.scene, this.camera);

        // ensure the callback is scoped correctly
        this.updateCallback = Ext.bind(this.update, this);
        this.update(null);

        holder.getEl().on('mouseup', this.handleClick, this);

        
        // this.mouseControls.rotateSpeed = 1.0;
        // this.mouseControls.zoomSpeed = 1.2;
        // this.mouseControls.panSpeed = 0.2;

        // this.mouseControls.noZoom = false;
        // this.mouseControls.noPan = false;

        // this.mouseControls.staticMoving = false;
        // this.mouseControls.dynamicDampingFactor = 0.3;

        // this.mouseControls.minDistance = radius * 1.1;
        // this.mouseControls.maxDistance = radius * 100;

        // this.mouseControls.keys = [ 65, 83, 68 ]; // [ rotateKey, zoomKey, panKey ]
    },

    getDaysSinceFirst: function(record, firstDate){
        var recordDate = new Date(record["_ValidFrom"]);
        var msDiff = recordDate - firstDate;
        // convert from ms to days
        return msDiff / 1000 / 60 / 60 / 24;
    },

    update: function(timestamp){
        
        var time = Date.now() * 0.00005;
        var h = ( 360 * ( 1.0 + time ) % 360 ) / 360;
        //this.material.color.setHSV( h, 0.8, 1.0 );

        // spin the camera in a circle
        // this.camera.position.x = Math.sin(step/1000) * this.cameraDistance;
        // this.camera.position.z = Math.cos(step/1000) * this.cameraDistance;
        // // you need to update lookAt every frame
        // this.camera.lookAt(this.scene.position);

        this.mouseControls.update();
        this.glRenderer.render(this.scene, this.camera);

        requestAnimationFrame(this.updateCallback, this.glRenderer.domElement);
    },

    handleClick: function(ev){
        // get the mouse position and create
        // a projector for the ray
        var mouseX = ev.getX();
        var mouseY = ev.getY();
        // var mouseX = evt.offsetX || evt.clientX;
        // var mouseY = evt.offsetY || evt.clientY;
        var projector = new THREE.Projector();

        // set up a new vector in the correct
        // coordinates system
        var holder = this.down('#holder');
        var width = holder.getWidth();
        var height = holder.getHeight();
        var vector = new THREE.Vector3(
            (mouseX / width) * 2 - 1,
            -(mouseY / height) * 2 + 1,
            0.5);

        // now "unproject" the point on the screen
        // back into the the scene itself. This gives
        // us a ray direction
        projector.unprojectVector(vector, this.camera);

        // create a ray from our current camera position
        // with that ray direction and see if it hits the story
        var cameraPos = this.camera.position;
        var ray = new THREE.Ray(cameraPos, vector.subSelf(cameraPos).normalize() );
        // add in particle system intersection support
        ray.monkeyPatch();
        var intersects = ray.intersectObject(this.particles);

        // if the ray intersects with the
        // surface work out where and distort the face
        if(intersects.length) {
            this.displayStory(intersects[0].point.story);
        }
    },

    displayStory: function(story){
        this.down('#formattedID').setValue("S"+ story["_UnformattedID"]);
        this.down('#name').setValue(story.Name);
        this.down('#kanbanState').setValue(story.KanbanState);
        this.down('#validFrom').setValue(story["_ValidFrom"]);
        this.down('#validTo').setValue(story["_ValidTo"]);

        console.log("Selected story "+ story["ObjectID"]);
    }

});
