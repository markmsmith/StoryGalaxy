(function() {

    // TODO make this configurable
    var openStates = ["Submitted", "Open"];

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
    
    /**
     * A chart that render the number of defects of each priority between defectsByPriorityConfig.startDate and defectsByPriorityConfig.endDate, which is a required field of the config object.
     */
	Ext.define('Rally.ui.chart.DefectsByPriorityChart', {
        extend: 'Rally.ui.chart.Chart',
        alias: 'widget.rallydefectsbyprioritychart',

        config: {
            /**
             * @cfg {Object} defectsByPriorityConfig (required) The configuration specific to the defects by priority chart 
             * @cfg {Date} defectsByPriorityConfig.startDate (required) The start of the time period to report on
             * @cfg {Date} defectsByPriorityConfig.endDate (required) The end of the time period to report on
             */
            defectsByPriorityConfig: {
                startDate: null,
                endDate: null
            },

            //TODO Delete this to revert back to the default type of Rally.data.lookback.SnapshotStore when new Lookback API url formaat is online
            storeType: 'Rally.data.lookback.SnapshotStoreOldUrl',

            /**
             * @cfg {Object} chartConfig The HighCharts chart config defining all the chart options.
             * Full documentation here: [http://www.highcharts.com/ref/](http://www.highcharts.com/ref/)
             */
            chartConfig: {
                chart: {
                    defaultSeriesType: 'column',
                    zoomType: 'x'
                },
                legend: {
                    enabled: false
                },
                title: {
                    text: "Defects By Priority"
                },
                xAxis: {
                    categories: [],
                    tickmarkPlacement: 'on',
                    tickInterval: 1,
                    title: {
                        enabled: 'Priority'
                    }
                    
                },
                tooltip: {
                    formatter: function() {
                        return ' '+ this.x + ': ' + this.y;
                    }
                },
                plotOptions : {
                    column: {
                        color: '#F00'                              
                    }
                },
                series: []
            },

            /**
             * @cfg {Object} storeConfig The configuration used to filter the data
             * retrieved from the Lookback API
             */
            storeConfig: {
                sorters: [
                    {
                        property: 'ObjectID',
                        direction: 'ASC'
                    },
                    {
                        property: '_ValidFrom',
                        direction: 'ASC'
                    }
                ],
                hydrate: ['Priority'],
                fetch: ['ObjectID', 'Priority'],

                // look for snapshots of defects that changed State
                filters: [
                    { property: '_Type', value: 'Defect' },
                    { property: 'State', operator: 'in', value: openStates },
                    { property: '_PreviousValues.State', operator: 'exists', value: true }
                ],
                limit: Infinity
            }
		},

		//TODO
		/*
		colorMap: {
            'High Attention': '#FF0000',
            
        },
        */

        constructor: function(config) {
            this._ensureStartAndEndCOnfigured(config);
            this.callParent(arguments);

            this._requestDefectTypeDef();

            var projectOID = new Rally.util.Ref(this.storeConfig.context.project).getOid();

            // get snapshots that happened during the date range in the current project
            this.storeConfig.filters = Ext.Array.union(this.storeConfig.filters, [
                {
                    property: '_ValidFrom',
                    operator: '>=',
                    value: Rally.util.DateTime.toIsoString(this.defectsByPriorityConfig.startDate, true)
                },
                {
                    property: '_ValidFrom',
                    operator: '<',
                    value: Rally.util.DateTime.toIsoString(this.defectsByPriorityConfig.endDate, true)
                },
                {
                    property: 'Project',
                    value: projectOID
                }
            ]);
        },

        _ensureStartAndEndCOnfigured: function(config){
            if(!config.defectsByPriorityConfig){
                throw new Error("Config property 'defectsByPriorityConfig' must be set.")
            }

            var defectsByPriorityConfig = config.defectsByPriorityConfig;

            if(Ext.typeOf(defectsByPriorityConfig.startDate) !== 'date'){
                throw new Error("Config property 'defectsByPriorityConfig.startDate' must be set.")
            }

            if(Ext.typeOf(defectsByPriorityConfig.endDate) !== 'date' ){
                throw new Error("Config property 'defectsByPriorityConfig.endDate' must be set.")
            }

        },

        _requestDefectTypeDef: function(){
            //TODO Change this to use a Rally.data.WsapiDataStore

            var queryUrl = "https://rally1.rallydev.com/slm/webservice/1.36/typedefinition.js";
            
            var params = {
                query: '( Name = "Defect" )',
                fetch: 'ObjectID,Name,Attributes,AllowedValues',
                start: '1',
                pagesize: '1'
            };
        
            var callback = Ext.bind(this._extractDefectPriorities, this);
            Ext.Ajax.request({
                url: queryUrl,
                method: 'GET',
                params: params,
                withCredentials: true,
                success: function(response){
                    var text = response.responseText;
                    var json = Ext.JSON.decode(text);
                    callback(json.QueryResult.Results[0]);
                }
            });
        },

        /**
         * Sets the defectPriorities field to the set of allowed values (Strings) for the Priority field of the given type definition
         */
        _extractDefectPriorities: function(defectTypeDef){
            // find the Priority attribute definition
            var stateAttDef = Ext.Array.filter(defectTypeDef.Attributes, function(attribute){
                return attribute.Name === "Priority";
            }, null)[0];

            // pull out all its alllowed values
            this.defectPriorities = Ext.Array.pluck(stateAttDef.AllowedValues, "StringValue");

            // render the chart if the store's already loaded
            if(this.allowdValues && this.storeLoaded){
                this.onStoreLoad(this.store);
            }
        },

        /**
         * Called when the store has been loaded
         *
         * @template
         */
        onStoreLoad: function(store) {
            this.storeLoaded = true;

            // render the chart if we're already retrieved the allowed values
            if(this.defectPriorities){
                this.callParent([store]);
            }

        },

        /**
         * @inheritdoc
         * @param store
         * @param results
         */
        prepareChartData: function(store, results) {
            // lumenize will be loaded into Rally.data.lookback.Lumenize from this point onwards

            var chartData = this.calculatePrioritiesData(results);
            this.chartConfig.xAxis.categories = chartData.categories;
            this.chartConfig.series.push(chartData.series);
        },

        /**
         * Calculates the count of defects for each priority
         */
        calculatePrioritiesData: function(results){
            var uniques = this._getUniqueSnapshots(results);

            var groupBySpec = {
                groupBy: 'Priority',
                aggregations: [
                    {
                        field: 'ObjectID',
                        f: '$count'
                    }
                ]

	        };
            
            var lumenize = Rally.data.lookback.Lumenize;
            var groups = lumenize.groupBy(uniques, groupBySpec);
            var series = this._convertGroupingsToSeries(groups);

            return {
                series: series,
                categories: this.defectPriorities
            };
        },

        /**
         * Assumes that results is sorted on ObjectID ASC and then _ValidFrom ASC in order to get last
         * unique snapshot for each ObjectID.
         */
        _getUniqueSnapshots: function(results){
            var uniques = [];
            var lastResult = null;
            var l = results.length;
            for(var i=0; i < l; ++i){
                var result = results[i];
                var oid = result.ObjectID;
                if(lastResult !== null && oid !== lastResult.ObjectID){
                    uniques.push(lastResult);
                }
                lastResult = result;
            }
            // make sure we get the last one
            if(lastResult !== null){
                uniques.push(lastResult);
            }

            return uniques;
        },
    
        /**
         * Converts the given set of groupings (Map<group, values>) to a column data series for a Chart
         */
	    _convertGroupingsToSeries: function(groups){

            var data = [];
            
            var l = this.defectPriorities.length;
            for(var i=0; i < l; ++i){
                var allowedValue = this.defectPriorities[i];
                if(groups[allowedValue]){
                    data.push( groups[allowedValue].ObjectID_$count );
                }
                else{
                    data.push(0);
                }
            }
            
            return {
                type : 'column',
                data: data,
                name: 'Count'
            };
	    }
	});
}());