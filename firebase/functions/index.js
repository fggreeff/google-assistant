// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict'

const config = require('./server/config/config')
const meetup_data = require('./server/config/data.json')
const functions = require('firebase-functions')
const { WebhookClient } = require('dialogflow-fulfillment')
const { Card, Suggestion } = require('dialogflow-fulfillment')
const { BasicCard, Button, Image, List } = require('actions-on-google')
const requestAPI = require('request-promise')

if (!config.API_KEY_MEETUP) {
  throw new Error('Missing API_KEY_MEETUP')
}

process.env.DEBUG = 'dialogflow:debug' // enables lib debugging statements

var admin = require('firebase-admin')

var serviceAccountConfig = require('./server/config/google_config.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountConfig),
  databaseURL: 'https://udemy-demo-assistant-c107b.firebaseio.com'
})

exports.dialogflowFirebaseFulfillment = functions.https.onRequest(
  (request, response) => {
    const agent = new WebhookClient({ request, response })
    console.log('>>>-----START------<<<')
    /*
    console.log(
      'Dialogflow Request headers: ' + JSON.stringify(request.headers)
    )
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body))
    console.log('Dialogflow intent: ' + agent.intent)
    */

    let conv = agent.conv() // Get Actions on Google library conv instance

    if (conv !== null && conv.data.meetupData === undefined) {
      conv.data.meetupData = []
    }

    if (conv !== null && conv.data.meetupCount === undefined) {
      conv.data.meetupCount = 0
    }

    function welcome(agent) {
      agent.add(`Welcome to my agent!`)
    }

    function fallback(agent) {
      agent.add(`I didn't understand`)
      agent.add(`I'm sorry, can you try again?`)
    }

    function checkIfGoogle(agent) {
      let isGoogle = true
      if (conv === null) {
        agent.add(`Only requests from Google Assistant are supported.
          Find the <YOUR-ACTION> action on Google Assistant directory!`)
        isGoogle = false
      }
      return isGoogle
    }

    async function listMeetups(agent) {
      if (checkIfGoogle(agent)) {
        let response = await getMeetupList() // let's display first meetup
        agent.add(response)
      }
    }

    async function getMeetupList() {
      conv.data.meetupCount = 0
      if (conv.data.meetupData.length === 0) {
        await getFakeMeetupData() // getMeetupData()
      }
      return buildMeetupListResponse()
    }

    async function showMeetups(agent) {
      if (checkIfGoogle(agent)) {
        let response = await displayMeetup() // let's display first meetup
        agent.add(response)
      }
    }

    async function displayMeetup() {
      if (conv.data.meetupData.length === 0) {
        await getFakeMeetupData() //getMeetupData()
      }
      return buildSingleMeetupResponse()
    }

    function buildSingleMeetupResponse() {
      let responseToUser
      if (conv.data.meetupData.length === 0) {
        responseToUser = 'No meetups available at this time!'
        conv.close(responseToUser)
      } else if (conv.data.meetupCount < conv.data.meetupData.length) {
        let meetup = conv.data.meetupData[conv.data.meetupCount]
        responseToUser = ' Meetup number ' + (conv.data.meetupCount + 1) + ' '
        responseToUser += meetup.name
        responseToUser += ' by ' + meetup.group.name

        let date = new Date(meetup.time)
        responseToUser += ' on ' + date.toDateString() + '.'

        conv.ask(responseToUser)

        //Check if screen is avail
        if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
          let image =
            'https://raw.githubusercontent.com/jbergant/udemydemoimg/master/meetup.png'
          conv.ask(
            new BasicCard({
              text: meetup.description,
              subtitle: 'by ' + meetup.group.name,
              title: meetup.name,
              buttons: new Button({
                title: 'Read more',
                url: meetup.link
              }),
              image: new Image({
                url: image,
                alt: meetup.name
              }),
              display: 'CROPPED'
            })
          )
        }
      }
      return conv
    }

    function getFakeMeetupData() {
      try {
        let meetups = meetup_data
        if (meetups.hasOwnProperty('events')) saveData(meetups.events)
      } catch (err) {
        console.log('No meetups data')
        console.log(err)
      }
    }

    function getMeetupData() {
      return requestAPI(
        'https://api.meetup.com/find/upcoming_events?' +
        '&sign=true&photo-host=public&lon=-0.057641&page=30&lat=51.528939&key=' +
        config.API_KEY_MEETUP
      )
        .then(function (data) {
          let meetups = JSON.parse(data)
          if (meetups.hasOwnProperty('events')) {
            saveData(meetups.events)
          }
        })
        .catch(function (err) {
          console.log('No meetups data')
          console.log(err)
        })
    }

    function saveData(data) {
      if (conv !== null) {
        conv.data.meetupData = data
      }
    }

    async function selectByNumberMeetup(agent) {
      if (checkIfGoogle(agent)) {
        let option = agent.contexts.find(function (obj) {
          return obj.name === 'actions.intent.option'
        })

        //I don't think the code ever reaches this if-statement below
        if (
          option &&
          option.hasOwnProperty('parameters') &&
          option.parameters.hasOwnProperty('OPTION')
        ) {
          console.log('>>>> selected option value: ', option.parameters.OPTION) // is the selected option value
          conv.data.meetupCount = parseInt(
            option.parameters.OPTION.replace('meetup ', '')
          )
        }

        let number = agent.parameters['number']
        if (number.length > 0) {
          conv.data.meetupCount = parseInt(number[0]) - 1
        }

        let response = await displayMeetup()
        agent.add(response)
      }
    }

    function buildMeetupListResponse() {
      let responseToUser

      if (conv.data.meetupData.length === 0) {
        responseToUser = 'No meetups available at this time!'
        conv.close(responseToUser)
      } else {
        let textList =
          'This is a list of meetups. Please select one of them to proceed'

        let image =
          'https://raw.githubusercontent.com/jbergant/udemydemoimg/master/meetupS.png'
        let items = {}
        for (let i = 0; i < conv.data.meetupData.length; i++) {
          let meetup = conv.data.meetupData[i]

          items['meetup ' + i] = {
            title: 'meetup ' + (i + 1),
            description: meetup.name,
            image: new Image({
              url: image,
              alt: meetup.name
            })
          }
          if (i < 3) {
            responseToUser += ' Meetup number ' + (i + 1) + ':'
            responseToUser += meetup.name
            responseToUser += ' by ' + meetup.group.name
            let date = new Date(meetup.time)
            responseToUser += ' on ' + date.toDateString() + '. '
          }
        }
        conv.ask(textList)
        conv.ask(responseToUser)

        if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
          conv.ask(
            new List({
              title: 'List of meetups: ',
              items
            })
          )
        }
      }
      return conv
    }

    async function previousMeetup(agent) {
      let response

      try {
        if (checkIfGoogle(agent)) {
          if (conv.data.meetupCount > 0) {
            conv.data.meetupCount--
            response = await displayMeetup()
          } else {
            response =
              'You have reached the begining of the list. I can repeat the event or move on to the next meetup event.'
          }
          agent.add(response)
        }
      } catch (err) {
        console.log('Error in previousMeetup: ' + err)
      }
    }

    async function nextMeetup(agent) {
      let response
      try {
        if (checkIfGoogle(agent)) {
          if (conv.data.meetupCount < 1) {
            //hardcode to max of 2 meetups for now, index starts 0
            conv.data.meetupCount++
            response = await displayMeetup() // let's display first meetup
          } else {
            conv.close('You have reached the end of the list. Goodbye')
            agent.add(conv)
          }
          return agent.add(response)
        }
      } catch (err) {
        console.log('Error in nextMeetup: ' + err)
      }
    }

    async function repeatMeetup(agent) {
      try {
        if (checkIfGoogle(agent)) {
          let response = await displayMeetup()

          agent.add(response)
        }
      } catch (err) {
        console.log('Error in repeatMeetup: ' + err)
      }
    }

    async function voteResults(agent) {
      let voteResultsRef = admin
        .database()
        .ref('artists')
        .orderByChild('votes')

      let results = []
      await voteResultsRef
        .once('value')
        .then(function (snapshot) {
          snapshot.forEach(function (childSnapshot) {
            let childData = childSnapshot.val()
            results.push(childData)
          })
        })
        .then(function () {
          results.reverse()
        })

      let textResponse = ''
      for (let i = 0; i < results.length; i++) {
        let text = i === 0 ? '' : ', '
        text += results[i].name + ' has ' + results[i].votes
        text += results[i].votes > 1 ? ' votes' : ' vote'
        textResponse += text
      }
      textResponse = 'Vote results are ' + textResponse
      console.log('This is it >>>: ' + textResponse)

      agent.add(textResponse)
    }

    function voting(agent) {
      let endConversation = false
      let responseText = ''
      let singer = agent.parameters['Singer']

      if (singer) {
        let artistName = singer.replace(' ', '').toLowerCase()
        let currentArtist = admin
          .database()
          .ref()
          .child('/artists/' + artistName)

        currentArtist.once('value', function (snapshot) {
          if (snapshot.exists() && snapshot.hasChild('votes')) {
            let obj = snapshot.val()
            currentArtist.update({
              votes: obj.votes + 1
            })
          } else {
            currentArtist.set({
              votes: 1,
              name: singer
            })
          }
        })
        responseText = 'Thank you for voting!'
      } else {
        if (conv.data.voteFallback === undefined) {
          conv.data.voteFallback = 0
        }
        conv.data.voteFallback++
        if (conv.data.voteFallback > 2) {
          responseText =
            'Thank you for voting. Your vote was refused. Try again later.'
          endConversation = true
        } else {
          console.log('fulfillmentText')
          responseText = request.body.queryResult.fulfillmentText
        }
      }

      if (endConversation) {
        conv.close(responseText)
      } else {
        conv.ask(responseText)
      }
      agent.add(conv)
    }

    // See https://github.com/dialogflow/dialogflow-fulfillment-nodejs/tree/master/samples/actions-on-google
    // for a complete Dialogflow fulfillment library Actions on Google client library v2 integration sample

    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map()
    intentMap.set('Default Welcome Intent', welcome)
    intentMap.set('Default Fallback Intent', fallback)
    intentMap.set('music vote', voting)
    intentMap.set('vote results', voteResults)
    intentMap.set('show meetups', showMeetups)
    intentMap.set('show meetups - next', nextMeetup)
    intentMap.set('show meetups - previous', previousMeetup)
    intentMap.set('show meetups - repeat', repeatMeetup)
    intentMap.set('show meetup list', listMeetups)
    intentMap.set('show meetup list - select.number', selectByNumberMeetup)
    intentMap.set('show meetup list - select.number - next', nextMeetup)
    intentMap.set('show meetup list - select.number - previous', previousMeetup)
    intentMap.set('show meetup list - select.number - repeat', repeatMeetup)



    agent.handleRequest(intentMap)
  }
)
