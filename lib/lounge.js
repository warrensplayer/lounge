// # Lounge
//
// Is a CouchDB migration tool
//

var _ = require('underscore'),
  fs = require('fs'),
  path = require('path'),
  async = require('async'),
  nano = require('nano'),
  Table = require('cli-table'),
  scriptPath = path.join(__dirname, 'scripts');

var version,
  couch_url,
  server,
  db_collections,
  design_doc_collections;

var lounge = function(config) {

  version = config.version;
  couch_url = config.couch_url;
  server = nano(couch_url);
  db_collections = config.db_collections;
  design_doc_collections = config.design_doc_collections;

  function run() {
    log('Running lounge for version: ' + version);

    var scripts = loadScripts();
    processScripts(scripts);

  }

  return {
    run: run
  };

};


function loadScripts() {
  log('============ Load Scripts ==============');
  var scripts = [];

  var files = fs.readdirSync(scriptPath);
  _.each(files, function(file) {
    if (file.indexOf(version) === 0) {
      var script = require(path.join(scriptPath, file));
      script.name = script.name ? script.name + ':' + file : file;
      scripts.push(script);
      log('Loaded script: ' + file);
    }
  });

  log('Loaded ' + scripts.length + ' scripts.');

  return scripts;
}

function processScripts(scripts) {
  log('========== Process Scripts ===============');
  async.forEachSeries(scripts, function(script, cb) {
    processScript(script, cb);
  });
}

function processScript(script, cb) {

  log('');
  log('Processing ' + script.name);
  log('------------------------------------------------------------');

  lookupDatabases(script, function(databases) {
    var database_results = [];
    async.forEachSeries(databases, function(database, next) {
      var lounger = createLounger(database);
      lounger.lounge(script, function(err, results) {
        if (err) { return next(err); }
        database_results.push({db: database, stats: results});
        next();
      });
    }, function(err) {
      if (err) {
        log('Error with ' + script.name + " - " + err);
      }

      _.each(database_results, function(result) {
        report(result);
      });
      log('Finished ' + script.name);
      log('------------------------------------------------------------');

      cb();

    });
  });

}

function report(result) {
  var table = new Table({
    head: ['Inserts', 'Updates', 'Removes', 'Errors'],
    colWidths: [10, 10, 10, 10]
  });
  log('Database: ' + result.db);
  var stats = result.stats;
  table.push([stats.insert, stats.update, stats.remove, stats.errors.length]);
  log(table.toString());
  if (stats.errors.length > 0) {
    log('** Errors **');
    var errorTable = new Table({
      head: ['#', 'Type', 'Error', 'Doc ID'],
      colWidths: [3, 8, 30, 40]
    });
    _.each(stats.errors, function(error, index) {
      var id = error.action.doc._id ? error.action.doc._id : 'N/A';
      errorTable.push([index, error.action.type, error.err, id]);
    });
    log(errorTable.toString());
    _.each(stats.errors, function(error, index) {
      log(index + ') ' + error.err);
      log('\t' + JSON.stringify(error.action.doc));
    });
  }
}

function lookupDatabases(script, cb) {
  if (script.db) {
    log('Using db: ' + script.db);
    cb([script.db]);
  } else if (script.dbs) {

    log('Lookup db collection: ' + script.dbs);
    var collectionConfig = db_collections[script.dbs];

    var designDoc = collectionConfig.view.split('/')[0];
    var viewName = collectionConfig.view.split('/')[1];

    log('Using design document: ' + designDoc + ' and view: ' + viewName);

    server.use(collectionConfig.db).view(designDoc, viewName, function(err, results) {
      if (err) {
        log('*** Error retrieving dbs from ' + collectionConfig.view + ' Error:' + (err.message ? err.message : ''));
        return cb([]);
      }
      var dbs = _.pluck(results.rows, 'key');
      cb(dbs);
    });
  }

}

var createLounger = function(database) {

  var db = server.use(database);

  var stats = {
    insert: 0,
    update: 0,
    remove: 0,
    errors: []
  };

  function getDbActions() {

    var type = {
        INSERT: 'insert',
        UPDATE: 'update',
        REMOVE: 'remove'
      },
      actions = [];

    function resolveAction(cb, action) {
      return function(err, body) {
        if (err) {
          stats.errors.push({action: action, err: err});
          cb();
        } else {
          ++stats[action.type];
          cb();
        }
      };
    }

    return {

      actions: {
        /*
         * Insert
         */
        insert: function(doc, name) {
          actions.push({type: type.INSERT, doc: doc, name: name});
        },
        update: function(doc) {
          actions.push({type: type.UPDATE, doc: doc});
        },
        remove: function(doc) {
          actions.push({type: type.REMOVE, doc: doc});
        }
      },

      done: function(cb) {

        async.forEachSeries(actions, function(action, cb) {
          if (action.type === type.INSERT) {
            var params = {};
            if (action.name) {
              params.doc_name = action.name;
            }

            db.insert(action.doc, params, resolveAction(cb, action));
          } else if (action.type === type.UPDATE) {
            db.insert(action.doc, resolveAction(cb, action));
          } else if (action.type === type.REMOVE) {
            db.destroy(action.doc._id, action.doc._rev, resolveAction(cb, action));
          }
        },
        function(err) {
          cb(err);
        });

      }
    };
  }

  function findRevision(id, cb) {
    db.get(id, function(err, body) {
      if (err) {
        return cb(null);
      } else {
        return cb(body._rev);
      }
    });
  }

  var actions = {
    add: function(add, cb) {
      var dbActions = getDbActions();
      add(dbActions.actions);
      dbActions.done(cb);
    },
    migrate: function(migrate, cb) {
      db.list({ include_docs: true }, function(err, body) {
        var docs = _.pluck(body.rows, 'doc');
        async.forEachSeries(docs, function(doc, cb) {
          var dbActions = getDbActions();
          migrate(doc, dbActions.actions);
          dbActions.done(cb);
        }, function (err) {
          cb(err);
        });
      });
    },
    design: function(design, cb) {

      var doc;
      _.each(design_doc_collections, function(designDirectory) {
        if (!doc) {
          var docPath = path.join(designDirectory, design);
          if (fs.existsSync(docPath)) {
            doc = fs.readFileSync(path.join(designDirectory, design));
          }
        }
      });

      if (!doc) {
        stats.errors.push({action: {type: 'insert', doc: design}, err: 'Could not find design document: ' + design});
        cb();
      } else {
        var designDoc = JSON.parse(doc);

        findRevision(designDoc._id, function(rev) {
          if (rev) {
            designDoc._rev = rev;
          }
          var dbActions = getDbActions();
          dbActions.actions.insert(designDoc);
          dbActions.done(cb);
        });
      }
    }
  };

  return {
    lounge: function(script, cb) {
      var actionNames = _.keys(actions);
      async.forEachSeries(actionNames, function(action, next) {
        if (script[action]) {
          actions[action](script[action], next);
        } else {
          next();
        }
      },
      function(err) {
        cb(err, stats);
      });

    }
  };
};

function log(msg) {
  console.log(msg);
}

module.exports = lounge;
