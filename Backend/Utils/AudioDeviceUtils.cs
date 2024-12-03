using NAudio.CoreAudioApi;
using ReCaps.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace ReCaps.Backend.Utils
{
    internal class AudioDeviceUtils
    {
        public static List<AudioDevice> GetInputDevices()
        {
            var devices = new List<AudioDevice>();
            var enumerator = new MMDeviceEnumerator();
            var collection = enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active);

            foreach (var device in collection)
            {
                devices.Add(new AudioDevice { Id = device.ID, Name = device.FriendlyName });
            }

            return devices;
        }

        public static List<AudioDevice> GetOutputDevices()
        {
            var devices = new List<AudioDevice>();
            var enumerator = new MMDeviceEnumerator();
            var collection = enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active);

            foreach (var device in collection)
            {
                devices.Add(new AudioDevice { Id = device.ID, Name = device.FriendlyName });
            }

            return devices;
        }
    }
}
