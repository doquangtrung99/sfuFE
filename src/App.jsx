import { useState, useRef,useEffect } from 'react'
import io from 'socket.io-client'
import { Device } from 'mediasoup-client'
import './app.css'
const socket = io('https://sfuconnect.website')

// const socket = io('http://localhost:1300')

const room = 'room-1'
let producerTransport = null;
  let consumerTransports = [];
  let device = null;
  const consumingTransports = [];

function App() {
  const [toggle,setToggle] = useState(false)
  let producerAudio = useRef(null);
  let producerVideo = useRef(null);

  useEffect(() => {
    
    socket.emit('joinRoom', { room }, async (routerRtpCapabilities) => {
      await handleCreateDevice({ routerRtpCapabilities })
      await handleSendTransport(room)
    })

  },[])
  const handleCreateDevice = async ({ routerRtpCapabilities }) => {
    try {
      device = new Device()
      await device.load({ routerRtpCapabilities })
    } catch (error) {
      console.log('ERROR', error)
    }
  }

  socket.on('new-producer', (producerId) => {
    console.log("NEW PRODUCER",producerId)
    handleCreateReceiveTransport(producerId)
  })

  const handleSendTransport = async (room) => {
    try {
      socket.emit('createWebRtcTransport',
        {
          room,
          producing: true,
          socketId: socket.id,
          sctpCapabilities: false
        },
        async ({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
          sctpParameters
        }) => {
          producerTransport = device.createSendTransport({
            id,
            iceParameters,
            iceCandidates,
            dtlsParameters,
            sctpParameters,
            iceServers: [],
          })
          producerTransport.on('connectionstatechange', (connectionState) => {
            console.log('Connection state changed', connectionState)
          })
          producerTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
            socket.emit('connectWebRtcTransport', { transportId: producerTransport.id, dtlsParameters, room, socketId: socket.id })
            callback()
          })
          producerTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
            socket.emit('produce',
              {
                transportId: producerTransport.id,
                kind,
                rtpParameters,
                appData,
                room,
                socketId: socket.id
              },
              ({ id, notFirstCreatedProducer }) => {
                if (notFirstCreatedProducer) getProducers(id)
                callback({ id })
              })
          })
          await handleConnectSendTransport(producerTransport)
      
        })
    } catch (error) {
      console.log('ERROR', error)
    }
  };

  const getConstraints = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    
    const ios = /iphone|ipod|ipad/.test(userAgent);
    const android = userAgent.includes('wv');

    if(ios || android){
      return 'mobile'
    }

    return 'web'
  }

  const handleConnectSendTransport = async (producerTransport) => {
    try {
      const isWeb = getConstraints() === 'web'
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isWeb ? {
          width: {
            min: 320,
            ideal:250,
            max: 640,
          },
          height: {
            min: 240,
            ideal:280,
            max: 450,
          }
        } : {
          width: 320,
          height: 280,
          facingMode: 'user',
          frameRate: {
            ideal: 60,
            min: 10
        }
        } 
      })

      let audioTrack = stream.getAudioTracks()[0]
      let videoTrack = stream.getVideoTracks()[0]

      const videoLocal = document.querySelector('.local-video')

      videoLocal.srcObject = stream
      videoLocal.playsInline = true
      videoLocal.muted = true
      videoLocal.autoPlay = true
     
      producerAudio.current = await producerTransport.produce({
        track: audioTrack,
        codecOptions: {
          opusStereo: 1,
          opusDtx: 1,
        }
      })

      producerVideo.current = await producerTransport.produce({
        track: videoTrack,
        params: {
          encodings: [
            {
              rid: 'r0',
              maxBitrate: 100000,
              scalabilityMode: 'S1T3',
            },
            {
              rid: 'r1',
              maxBitrate: 300000,
              scalabilityMode: 'S1T3',
            },
            {
              rid: 'r2',
              maxBitrate: 900000,
              scalabilityMode: 'S1T3',
            },
          ],
          codecOptions: {
            videoGoogleStartBitrate: 1000
          }
        }
      })
    } catch (error) {

      const res = await navigator.mediaDevices.enumerateDevices()
      let audioAvailable = false;
      let videoAvailable = false;

      res.forEach((device) => {
        if (device.kind === 'audioinput') {
          audioAvailable = true
        }

        if (device.kind === 'videoinput') {
          videoAvailable = true
        }
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioAvailable,
        video: videoAvailable && {
          width: {
            min: 640,
            max: 1920,
          },
          height: {
            min: 400,
            max: 1080,
          }
        }
      });

      if (audioAvailable && !videoAvailable) {
        const audioTrack = stream.getAudioTracks()[0]
        const videoLocal = document.querySelector('.local-video')
        videoLocal.srcObject = stream
        producerAudio.current = await producerTransport.produce({
          track: audioTrack,
          codecOptions: {
            opusStereo: 1,
            opusDtx: 1,
          }
        })

      };

      if (videoAvailable && !audioAvailable) {
        const videoTrack = stream.getVideoTracks()[0]
        const videoLocal = document.querySelector('.local-video')
        videoLocal.srcObject = stream
        producerVideo.current = await producerTransport.produce({
          track: videoTrack,
          params: {
            encodings: [
              {
                rid: 'r0',
                maxBitrate: 100000,
                scalabilityMode: 'S1T3',
              },
              {
                rid: 'r1',
                maxBitrate: 300000,
                scalabilityMode: 'S1T3',
              },
              {
                rid: 'r2',
                maxBitrate: 900000,
                scalabilityMode: 'S1T3',
              },
            ],
            codecOptions: {
              videoGoogleStartBitrate: 1000
            }
          }
        })
      };

      if (audioAvailable && videoAvailable) {
        const audioTrack = stream.getAudioTracks()[0]
        const videoTrack = stream.getVideoTracks()[0]
        const videoLocal = document.querySelector('.local-video')
        videoLocal.srcObject = stream
        producerAudio.current = await producerTransport.produce({
          track: audioTrack,
          codecOptions: {
            opusStereo: 1,
            opusDtx: 1,
          }
        })

        producerVideo.current = await producerTransport.produce({
          track: videoTrack,
          params: {
            encodings: [
              {
                rid: 'r0',
                maxBitrate: 100000,
                scalabilityMode: 'S1T3',
              },
              {
                rid: 'r1',
                maxBitrate: 300000,
                scalabilityMode: 'S1T3',
              },
              {
                rid: 'r2',
                maxBitrate: 900000,
                scalabilityMode: 'S1T3',
              },
            ],
            codecOptions: {
              videoGoogleStartBitrate: 1000
            }
          }
        })
      };


      producerAudio.current.on('trackended',() => {
        console.log('trackended ')
      })

      producerAudio.current.on('transportclose',() => {
        console.log('transportclose ')
      })

      producerVideo.current.on('trackended',() => {
        console.log('trackended video')
      })

      producerVideo.current.on('transportclose',() => {
        console.log('transportclose video')
      })
    }
  };

  const getProducers = async (currentProducerId) => {
    socket.emit('getProducers', { room }, (producers) => {
      console.log('pro',producers,'id',currentProducerId)
      producers.forEach(producer => handleCreateReceiveTransport(producer.producerId))
    })
  }

  const handleCreateReceiveTransport = async (producerServerId) => {
    try {
      if (consumingTransports.includes(producerServerId)) return;
      consumingTransports.push(producerServerId);
      console.log('EMIT')
      socket.emit('createWebRtcTransport',
        {
          room,
          producing: false,
          socketId: socket.id,
          sctpCapabilities: false
        },
        async ({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
          sctpParameters
        }) => {
          const consumerTransport = device.createRecvTransport({
            id,
            iceParameters,
            iceCandidates,
            dtlsParameters,
            sctpParameters,
            iceServers: [],
          })
          consumerTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
            socket.emit('receive-consumer-connect', { dtlsParameters, consumerTransportId: consumerTransport.id, room, socketId: socket.id })
            callback()
          })
        await handleConnectReceiveTransport(consumerTransport, producerServerId)
        })
    } catch (error) {
      console.log('ERROR', error)
    }
  }

  const handleConnectReceiveTransport = (consumerTransport, producerServerId) => {
    try {
      socket.emit('connectConsumer', {
        rtpCapabilities: device.rtpCapabilities,
        producerServerId,
        consumerTransportId: consumerTransport.id,
        room,
        socketId: socket.id
      }, async ({ params, consumerTransportId }) => {
        const consumer = await consumerTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters
        })

        consumerTransports = [
          ...consumerTransports,
          {
            consumerTransport,
            serverConsumerTransportId: consumerTransportId,
            producerId: producerServerId,
            consumer
          }
        ]

        const { track } = consumer
        let audio,video;
        
        if(track.kind === 'audio') {
          if(producerAudio.current.id !== producerServerId){
            audio = document.createElement('audio')
            audio.setAttribute('id', `id-${producerServerId}`)
            audio.srcObject = new MediaStream([track])
            audio.autoplay = true
            const container = document.querySelector('.paticipants-audio')
            container.appendChild(audio)
          }
        }else{
          if(producerVideo.current.id !== producerServerId){
            video = document.createElement('video')
            video.setAttribute('id', `id-${producerServerId}`)
            video.srcObject = new MediaStream([track])
            video.playsInline = true
            video.autoplay = true
            const container = document.querySelector('.paticipants-video')
            container.appendChild(video)
          }
        }

        console.log('TRACK',track)
        socket.emit('resume')
      })
    } catch (error) {
      console.log(error)
    }
  }
  socket.on('producerclose', (producerId) => {
    console.log('PRODUCER CLOSE',producerId)
    const videoContainer = document.querySelector('.paticipants-video');
    const audioContainer = document.querySelector('.paticipants-audio');
    
    const producerToClose = consumerTransports.find(item => item.producerId === producerId);
    producerToClose.consumerTransport.close();
    producerToClose.consumer.close();
    const audio = audioContainer.querySelector(`#id-${producerId}`);
    const video = videoContainer.querySelector(`#id-${producerId}`);
    if(audio){
      audioContainer.removeChild(audio);
    }
    if(video){
      videoContainer.removeChild(video);
    }
  })

  return (
    <>
      <div >
        <video className='local-video' autoPlay />
      </div>
      <section className='paticipants-video' style={{display:'flex',flexWrap:'wrap'}}>

      </section>
      <section className='paticipants-audio'>

      </section>
      <button onClick={() => {
        if(!toggle){
          producerAudio.current.pause();
        }else{
          producerAudio.current.resume();
        }
        setToggle(prev => !prev)
      }
        }>Mute Your Self</button>
    </>
  )
}

export default App
