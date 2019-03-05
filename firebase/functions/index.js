// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict'

const config = require('./server/config/config')
const functions = require('firebase-functions')
const { WebhookClient } = require('dialogflow-fulfillment')
const { Card, Suggestion } = require('dialogflow-fulfillment')
const { BasicCard, Button, Image } = require('actions-on-google')
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
    console.log(
      'Dialogflow Request headers: ' + JSON.stringify(request.headers)
    )
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body))
    console.log('Dialogflow intent: ' + agent.intent)
    console.log('Dialogflow music parameters: ' + agent.parameters['Singer'])

    let conv = agent.conv() // Get Actions on Google library conv instance

    if (conv !== null && conv.data.meetupData === undefined) {
      conv.data.meetupData = []
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

    async function showMeetups(agent) {
      if (checkIfGoogle(agent)) {
        let response = await displayMeetup() // let's display first meetup
        agent.add(response)
      }
    }

    async function displayMeetup() {
      if (conv.data.meetupData.length === 0) {
        await getMeetupData()
        return buildSingleMeetupResponse()
      } else {
        return buildSingleMeetupResponse()
      }
    }

    function buildSingleMeetupResponse() {
      let responseToUser
      if (conv.data.meetupData.length === 0) {
        responseToUser = 'No meetups available at this time!'
        conv.ask(responseToUser)
      } else {
        let meetup = conv.data.meetupData[0]
        responseToUser = ' Meetup number 1 '
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

    function getMeetupData() {
      return requestAPI(
        'https://api.meetup.com/find/upcoming_events?' +
          '&sign=true&photo-host=public&lon=-0.057641&page=30&lat=51.528939&key=' +
          config.API_KEY_MEETUP
      )
        .then(function(data) {
          let meetups = JSON.parse(data)
          if (meetups.hasOwnProperty('events')) {
            saveData(meetups.events)
          }
        })
        .catch(function(err) {
          console.log('No meetups data')
          console.log(err)
        })
    }

    function saveData(data) {
      if (conv !== null) {
        conv.data.meetupData = data
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
        .then(function(snapshot) {
          snapshot.forEach(function(childSnapshot) {
            let childData = childSnapshot.val()
            results.push(childData)
          })
        })
        .then(function() {
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

        currentArtist.once('value', function(snapshot) {
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

    // Uncomment and edit to make your own intent handler
    // uncomment `intentMap.set('your intent name here', yourFunctionHandler);
    // below to get this function to be run when a Dialogflow intent is matched
    function yourFunctionHandler(agent) {
      agent.add(
        `This message is from Dialogflow's Cloud Functions for Firebase editor!`
      )
      agent.add(
        new Card({
          title: `Title: this is a card title`,
          imageUrl:
            'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
          text: `This is the body text of a card.  You can even use line\n  breaks and emoji! 💁`,
          buttonText: 'This is a button',
          buttonUrl: 'https://assistant.google.com/'
        })
      )
      agent.add(new Suggestion(`Quick Reply`))
      agent.add(new Suggestion(`Suggestion`))
      agent.setContext({
        name: 'weather',
        lifespan: 2,
        parameters: { city: 'Rome' }
      })
    }
    // Uncomment and edit to make your own Google Assistant intent handler
    // uncomment `intentMap.set('your intent name here', googleAssistantHandler);`
    // below to get this function to be run when a Dialogflow intent is matched
    function googleAssistantHandler(agent) {
      let conv = agent.conv() // Get Actions on Google library conv instance
      conv.ask('Hello from the Actions on Google client library!') // Use Actions on Google library
      agent.add(conv) // Add Actions on Google library responses to your agent's response
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

    intentMap.set('your intent name here', yourFunctionHandler)
    intentMap.set('your intent name here', googleAssistantHandler)
    agent.handleRequest(intentMap)
  }
)
