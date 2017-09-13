var EventEmitter = require('events')
var AWS = require('aws-sdk')
var utils = require('../utils')
var github = require('../sources/github')

var ecs = new AWS.ECS()

module.exports = runBuild

function runBuild(buildData, context, cb) {
  // TODO: figure out whether to use mergeable flags on GH events or not

  var build = new BuildInfo(buildData, context)
  console.log('Build event type', build.eventType)
  console.log('Branch', build.branch)

  if(build.eventType == 'push' && build.branch == 'master'){
    console.log('running deploy task')
    getContainerInstances(cb)
  } else if(build.eventType == 'pull_request'){
    console.log('pull request')
    console.log(build.prNum)
  }
}

function getContainerInstances(cb) {
  console.log(process.env.ECS_CLUSTER_NAME)
  var params = {
    cluster: process.env.ECS_CLUSTER_NAME,
    status: "ACTIVE"
  }
  ecs.listContainerInstances(params, function(err, data){
    if (err) {
      console.log(err, err.stack); //an error occurred
    } else {
      console.log('Data from ecs', data)
      runDeployTask(data.containerInstanceArns, cb)
    }


  })
}

function runDeployTask(instances, cb) {
    var params = {
      cluster: process.env.ECS_CLUSTER_NAME,
      containerInstances: instances,
      startedBy: "Lambda",
      taskDefinition: process.env.taskDefinition,
    }
    console.log(params)

    ecs.startTask(params, function(err, data){
      if (err) console.log(err, err.stack)
      console.log(data)
      cb(data)
    })

    // ecs.runTask(params, function(err, data) {
    //     if (err) console.log(err, err.stack); // an error occurred
    //     else     console.log(data);           // successful response
    //     context.done(err, data)
    // })
}

function BuildInfo(buildData, context) {
  this.startedAt = new Date()
  this.endedAt = null

  this.status = 'pending'
  this.statusEmitter = new EventEmitter()

  // Any async functions to run on 'finish' should be added to this array,
  // and be of the form: function(build, cb)
  this.statusEmitter.finishTasks = []

  this.project = buildData.project
  this.buildNum = buildData.buildNum || 0

  this.repo = buildData.repo || this.project.replace(/^gh\//, '')

  if (buildData.trigger) {
    var triggerPieces = buildData.trigger.split('/')
    this.trigger = buildData.trigger
    this.eventType = triggerPieces[0] == 'pr' ? 'pull_request' : 'push'
    this.prNum = triggerPieces[0] == 'pr' ? +triggerPieces[1] : 0
    this.branch = triggerPieces[0] == 'push' ? triggerPieces[1] : (buildData.branch || 'master')
  } else {
    this.eventType = buildData.eventType
    this.prNum = buildData.prNum
    this.branch = buildData.branch
    this.trigger = this.prNum ? `pr/${this.prNum}` : `push/${this.branch}`
  }

  this.event = buildData.event
  this.isPrivate = buildData.isPrivate
  this.isRebuild = buildData.isRebuild

  this.branch = buildData.branch
  this.cloneRepo = buildData.cloneRepo || this.repo
  this.checkoutBranch = buildData.checkoutBranch || this.branch
  this.commit = buildData.commit
  this.baseCommit = buildData.baseCommit
  this.comment = buildData.comment
  this.user = buildData.user

  this.isFork = this.cloneRepo != this.repo

  this.committers = buildData.committers

  this.config = null
  // this.cloneDir = path.join(config.BASE_BUILD_DIR, this.repo)

  this.requestId = context.awsRequestId
  this.logGroupName = context.logGroupName
  this.logStreamName = context.logStreamName

  this.token = ''
  this.logUrl = ''
  this.lambdaLogUrl = ''
  this.buildDirUrl = ''
  this.error = null
}
