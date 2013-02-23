var BaseCtrl = function ($scope, $routeParams, $location, $http) {

    var titleCase = function(str) {
        return str.replace(/_/g,' ').replace(/[A-Z]/g,' $&').replace(/\w\S*/g, function (txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
    };

    var master = {};
    $scope.record = {};
    $scope.formSchema = [];
    $scope.listSchema = [];
    $scope.recordList = [];
    $scope.dataDependencies = {};
    // Process RouteParams / Location
    if ($routeParams.model) {
        $scope.modelName = $routeParams.model;
        $scope.id = $routeParams.id
    } else {
        // Support using the base controller with override views
        $scope.location = $location.$$path.split('/');
        $scope.modelName = $scope.location[1];
        if ($scope.location[2] !== 'new') {
            $scope.id = $scope.location[2];
        }
    }
    $scope.modelNameDisplay = titleCase($scope.modelName);

    var handleFieldType = function(formInstructions, mongooseType, mongooseOptions) {
        if (mongooseType.caster) {
            formInstructions.array = true;
            mongooseType = mongooseType.caster;
        }
        if (mongooseType.instance == 'String') {
            if (!formInstructions.type) {
                // leave specified types as they are - textarea is supported
                formInstructions.type = 'text';
            }
        } else if (mongooseType.instance == 'ObjectID') {
            formInstructions.type = 'select';
            formInstructions.options = formInstructions.id + 'Options';
            setUpSelectOptions(mongooseOptions.ref, formInstructions);
        } else if (mongooseType.instance == 'Date') {
            formInstructions.type = 'text';
            formInstructions.add = 'ui-date ui-date-format';
        } else if (mongooseType.instance == 'boolean') {
            formInstructions.type = 'checkbox';
        } else if (mongooseType.instance == 'Number') {
            formInstructions.type = 'number';
        } else {
            throw new Error("Field " + formInstructions.name + " is of unsupported type " + mongooseType.instance);
        }
        if (mongooseOptions.required) {
            formInstructions.required = true;
        }
        return formInstructions;
    };

    var basicInstructions = function(field, formData, prefix) {
        formData.name = prefix+field;
        formData.id = formData.id || 'f_' + prefix+field;
        formData.label = (formData.hasOwnProperty('label') && formData.label) == null ? '' : (formData.label || titleCase(field));
        return formData;
    };

    var handleListInfo = function(destList, listOptions, field) {
        var listData = listOptions || {hidden:true};
        if (!listData.hidden) {
            if (typeof listData == "object") {
                listData.name = field;
                destList.push(listData);
            } else {
                destList.push({name:field});
            }
        }
    };

    var handleEmptyList = function(destList, destForm) {
        // If no list fields specified use the first non hidden string field
        for (var i= 0, l=destForm.length; i<l; i++) {
            if (destForm[i].type == 'text') {
                destList.push({name:destForm[i].name});
                break;
            }
        }
        if (destList.length === 0) {
            // If it is still blank then just use the first field
            destList.push({name:destForm[0].name});
        }
    };

    var evaluateConditional = function(condition, data) {

        function evaluateSide(side) {
            var result = side;
            if (typeof side === "string" && side.slice(0,1) === '$') {
                result = data[side.slice(1)]
            }
            return result;
        }

        var lhs = evaluateSide(condition.lhs)
            , rhs = evaluateSide(condition.rhs)
            , result;

        switch (condition.comp) {
            case 'eq' :
                result = (lhs === rhs);
                break;
            case 'ne' :
                result = (lhs !== rhs);
                break;
            default :
                throw new Error("Unsupported comparator " + condition.comp);
        }
        return result;
    };

//    Conditionals
//    $scope.dataDependencies is of the form {fieldName1: [fieldId1, fieldId2], fieldName2:[fieldId2]}

    var handleConditionals = function(condInst, id) {

        var dependency = 0;

        function handleVar(theVar) {
            if (typeof theVar === "string" && theVar.slice(0,1) === '$') {
                var fieldName = theVar.slice(1);
                var fieldDependencies = $scope.dataDependencies[fieldName] || [];
                fieldDependencies.push(id);
                $scope.dataDependencies[fieldName] = fieldDependencies;
                dependency += 1;
            }
        }

        var display = true;
        if (condInst) {
            handleVar(condInst.lhs);
            handleVar(condInst.rhs);
            if (dependency === 0 && !evaluateConditional(condInst)) {
                display = false;
            }
        }
        return display;
    };

    $scope.updateDataDependentDisplay = function(curValue, oldValue, force) {
        for (var field in $scope.dataDependencies) {
            if ($scope.dataDependencies.hasOwnProperty(field) && (force || (curValue[field] != oldValue[field]))) {
                var depends = $scope.dataDependencies[field];
                for (var i = 0; i < depends.length ; i+=1) {
                    var id = depends[i];
                    for (var j = 0; j < $scope.formSchema.length;  j+= 1) {
                        if ($scope.formSchema[j].id === id) {
                            var control = $('#cg_' + id);
                            if (evaluateConditional($scope.formSchema[j].showIf, curValue)) {
                                control.show();
                            } else {
                                control.hide();
                            }
                        }
                    }
                }
            }
        }
    };

    var handleSchema = function(source, destForm, destList, prefix, doRecursion) {
        for (var field in source) {
            if (field !== '_id' && source.hasOwnProperty(field)) {
                var mongooseType = source[field],
                    mongooseOptions = mongooseType.options || {};
                var formData = mongooseOptions.form || {};
                if (!formData.hidden) {
                    if (mongooseType.schema && doRecursion) {
                        var schemaSchema = [];
                        handleSchema(mongooseType.schema, schemaSchema, null, field+'.',true);
                        var sectionInstructions = basicInstructions(field, formData, prefix);
                        sectionInstructions.schema = schemaSchema;
                        destForm.push(sectionInstructions);
                    } else {
                        var formInstructions = basicInstructions(field, formData, prefix);
                        if (handleConditionals(formInstructions.showIf, formInstructions.id)) {
                            destForm.push(handleFieldType(formInstructions, mongooseType, mongooseOptions));
                        }
                        if (destList) {
                            handleListInfo(destList, mongooseOptions.list, field);
                        }
                    }
                }
            }
        }
        if (destList && destList.length === 0) {
            handleEmptyList(destList,destForm);
        }
    };

    $http.get('api/schema/' + $scope.modelName).success(function (data) {
        handleSchema(data, $scope.formSchema, $scope.listSchema, '',true);

        if ($location.$$path.slice(1) == $scope.modelName) {
            $http.get('api/' + $scope.modelName).success(function (data) {
                $scope.recordList = data;
                }).error(function () {
                    $location.path("/404");
                });
        } else {
            $scope.$watch('record', function(newValue, oldValue) {
                $scope.updateDataDependentDisplay(newValue, oldValue, false)
            },true);
//


            if ($scope.id) {
                $http.get('api/' + $scope.modelName + '/' + $scope.id).success(function (data) {
                    if (data.success === false) {
                        $location.path("/404");
                    }
                    master = convertToAngularModel(data);
                    $scope.cancel();
                }).error(function () {
                    $location.path("/404");
                });
            }
        }
    }).error(function () {
            $location.path("/404");
    });

    $scope.cancel = function () {
        $scope.record = angular.copy(master);
    };

    $scope.save = function () {
        //Convert the lookup values into ids

        var dataToSave = convertToMongoModel(angular.copy($scope.record));
        if ($scope.record._id) {
            $http.post('api/' + $scope.modelName + '/' + $scope.id, dataToSave).success(function () {
                master = $scope.record;
                $scope.cancel();
            });
        } else {
            $http.post('api/' + $scope.modelName, dataToSave).success(function (doc) {
                $location.path('/' + $scope.modelName + '/' + doc._id + '/edit');
            });
        }
    };

    $scope.new = function () {
        $location.path('/' + $scope.modelName + '/new');
    };

    $scope.delete = function () {
        if ($scope.record._id) {
            //TODO: When we upgrade to Twitter Bootstrap 2.2.2 get a confirm using http://bootboxjs.com/
            $http.delete('api/' + $scope.modelName + '/' + $scope.id);
        }
        $location.path('/' + $scope.modelName);
    };

    $scope.isCancelDisabled = function () {
        return angular.equals(master, $scope.record);
    };

    $scope.isSaveDisabled = function () {
        return $scope.myForm.$invalid || angular.equals(master, $scope.record);
    };


    $scope.add = function (elementInfo) {
        var fieldName = elementInfo.field.name, arrayField;
        var fieldParts = fieldName.split('.');
        arrayField = $scope.record;
        for (var i = 0, l = fieldParts.length; i < l; i++) {
            if (!arrayField[fieldParts[i]]) {
                if (i === l-1) {
                    arrayField[fieldParts[i]] = [];
                } else {
                    arrayField[fieldParts[i]] = {};
                }
            }
            arrayField = arrayField[fieldParts[i]];
        }
        arrayField.push({});
    };


    $scope.remove = function (fieldInfo, value) {
        // Remove an element from an array
        var fieldName = fieldInfo.$parent.field.name;
        var fieldParts = fieldName.split('.');
        var arrayField = $scope.record;
        for (var i = 0, l = fieldParts.length; i < l; i++) {
            arrayField = arrayField[fieldParts[i]];
        }
        arrayField.splice(value,1);
    };

    // Convert {_id:'xxx', array:['item 1'], lookup:'012abcde'} to {_id:'xxx', array:[{x:'item 1'}], lookup:'List description for 012abcde'}
    // Which is what we need for use in the browser
    var convertToAngularModel = function (anObject) {
        var schema = $scope.formSchema;
        for (var i = 0; i < schema.length; i++) {

            // Convert {array:['item 1']} to {array:[{x:'item 1'}]}
            if (schema[i].array && schema[i].type == 'text' && anObject[schema[i].name]) {
                for (var j = 0; j < anObject[schema[i].name].length; j++) {
                    anObject[schema[i].name][j] = {x:anObject[schema[i].name][j]}
                }
            }

            // Convert {lookup:'012abcde'} to {lookup:'List description for 012abcde'}
            if ($scope[schema[i].id + '_ids'] && $scope[schema[i].id + '_ids'].length > 0) {
                anObject[schema[i].name] = convertForeignKeys(schema[i], anObject[schema[i].name]);
            }
        }
        return anObject;
    };

    // Convert foreign keys into their display for selects
    // Called when the model is read and when the lookups are read
    function convertForeignKeys(schemaElement, input) {
        if (schemaElement.array) {
            var returnArray = [];
            for (var j = 0; j < input.length; j++) {
                returnArray.push({x:convertIdToListValue(input[j], $scope[schemaElement.id + '_ids'], $scope[schemaElement.id + 'Options'])});
            }
            return returnArray;
        } else {
            return convertIdToListValue(input, $scope[schemaElement.id + '_ids'], $scope[schemaElement.id + 'Options']);
        }
    }

    // Reverse the process of convertToAngularModel
    var convertToMongoModel = function (anObject) {
        var schema = $scope.formSchema;
        for (var i = 0; i < schema.length; i++) {

            // Convert {array:[{x:'item 1'}]} to {array:['item 1']}
            if (schema[i].array && schema[i].type == 'text' && anObject[schema[i].name]) {
                for (var j = 0; j < anObject[schema[i].name].length; j++) {
                    anObject[schema[i].name][j] = anObject[schema[i].name][j].x
                }
            }

            // Convert {lookup:'List description for 012abcde'} to {lookup:'012abcde'}
            if ($scope[schema[i].id + '_ids'] && $scope[schema[i].id + '_ids'].length > 0) {
                if (schema[i].array) {
                    if (anObject[schema[i].name]) {
                        for (j = 0; j < anObject[schema[i].name].length; j++) {
                            anObject[schema[i].name][j] = convertListValueToId(anObject[schema[i].name][j].x, $scope[schema[i].id + 'Options'], $scope[schema[i].id + '_ids'])
                        }
                    }
                } else {
                    anObject[schema[i].name] = convertListValueToId(anObject[schema[i].name], $scope[schema[i].id + 'Options'], $scope[schema[i].id + '_ids'], schema[i].name);
                }
            }
        }
        return anObject;
    };

    var convertIdToListValue = function (id, idsArray, valuesArray) {
        var index = idsArray.indexOf(id);
        if (index === -1) {
            throw new Error("Invalid data - id " + id + " not found in " + idsArray)
        }
        return valuesArray[index];
    };

    var convertListValueToId = function (value, valuesArray, idsArray, fname) {
        var index = valuesArray.indexOf(value);
        if (index === -1) {
            throw new Error("Invalid data - value " + value + " not found in " + valuesArray + " processing " + fname)
        }
        return idsArray[index];
    };

    var setUpSelectOptions = function (lookupCollection, schemaElement) {
        var optionsList = $scope[schemaElement.options] = [];
        var idList = $scope[schemaElement.id + '_ids'] = [];
        var fieldName = schemaElement.name;

        $http.get('api/schema/' + lookupCollection).success(function (data) {
            var listInstructions = [], unusedFormSchema = [];
            handleSchema(data,unusedFormSchema,listInstructions, '',false);
            $http.get('api/' + lookupCollection).success(function (data) {
                for (var i = 0; i < data.length; i++) {
                    var option = '';
                    for (var j = 0; j < listInstructions.length; j++) {
                        option += data[i][listInstructions[j].name] + ' ';
                    }
                    optionsList.push(option.trim());
                    idList.push(data[i]._id);
                }
                if (master[fieldName] && master[fieldName].length) {
                    master[fieldName] = convertForeignKeys(schemaElement, master[fieldName]);
                    $scope.record[fieldName] = master[fieldName];
                }
            })
        })
    }

};